// api/orders/accept.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { auth, db } from '@/lib/firebase-admin';
import { addBusinessHours } from '@/lib/officeHours.backend';

const THIRTY_MIN_MS = 30 * 60 * 1000;

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

    const { orderId } = req.body;

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

    // Verify this is the correct merchant
    if (order?.merchantId !== userId) {
      return res.status(403).json({ error: 'Unauthorized - not your order' });
    }

    // Check if already accepted
    if (order.workflowStatus !== 'vendor_pending') {
      return res.status(400).json({ 
        error: 'Order already processed', 
        currentStatus: order.workflowStatus 
      });
    }

    // Check if expired
    const now = Date.now();
    if (now > order.vendorAcceptBy) {
      // Mark as expired
      await orderRef.update({
        workflowStatus: 'vendor_expired',
      });
      return res.status(400).json({ error: 'Acceptance window has expired' });
    }

    // ✅ Calculate admin deadline with business hours
    const adminPlanBy = addBusinessHours(now, THIRTY_MIN_MS);

    console.log(`Vendor accepted at: ${new Date(now).toISOString()}`);
    console.log(`Admin must plan by: ${new Date(adminPlanBy).toISOString()}`);

    // Update order
    await orderRef.update({
      workflowStatus: 'vendor_accepted',
      vendorAcceptedAt: now,
      adminPlanBy: adminPlanBy, // ← Business hours applied!
    });

    console.log(`✅ Order ${orderId} accepted. Admin must plan by: ${new Date(adminPlanBy).toISOString()}`);

    res.status(200).json({ 
      success: true, 
      message: 'Order accepted successfully',
      adminPlanBy: adminPlanBy,
      adminPlanByFormatted: new Date(adminPlanBy).toISOString(),
    });

  } catch (error: any) {
    console.error('Error accepting order:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
