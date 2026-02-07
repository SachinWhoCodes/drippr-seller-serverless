// api/admin/assign-pickup.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { auth, db } from '@/lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // TODO: Verify user is admin
    // const adminRef = await db.collection('admins').doc(userId).get();
    // if (!adminRef.exists) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const { orderId, pickupWindow, pickupAddress, notes, deliveryPartner } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Fetch order
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderSnap.data();

    // Verify order is in correct state
    if (order?.workflowStatus !== 'vendor_accepted' && order?.workflowStatus !== 'admin_overdue') {
      return res.status(400).json({ 
        error: 'Order is not ready for pickup assignment',
        currentStatus: order?.workflowStatus,
        requiredStatus: 'vendor_accepted or admin_overdue'
      });
    }

    const now = Date.now();

    // Prepare pickup plan data
    const pickupPlan = {
      pickupWindow: pickupWindow || null,
      pickupAddress: pickupAddress || null,
      notes: notes || null,
    };

    // Prepare delivery partner data
    const deliveryPartnerData = {
      name: deliveryPartner?.name || null,
      phone: deliveryPartner?.phone || null,
      etaText: deliveryPartner?.etaText || null,
      trackingUrl: deliveryPartner?.trackingUrl || null,
    };

    // Update order
    await orderRef.update({
      workflowStatus: 'pickup_assigned',
      adminPlannedAt: now,
      pickupPlan: pickupPlan,
      deliveryPartner: deliveryPartnerData,
    });

    console.log(`✅ Pickup assigned for order ${orderId} at: ${new Date(now).toISOString()}`);
    console.log(`   Pickup window: ${pickupWindow}`);
    console.log(`   Delivery partner: ${deliveryPartner?.name}`);

    res.status(200).json({ 
      success: true, 
      message: 'Pickup assigned successfully',
      assignedAt: now,
    });

  } catch (error: any) {
    console.error('Error assigning pickup:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
