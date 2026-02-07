// api/orders/mark-dispatched.ts
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

    // Check if pickup has been assigned
    if (order.workflowStatus !== 'pickup_assigned') {
      return res.status(400).json({ 
        error: 'Order must have pickup assigned before dispatch', 
        currentStatus: order.workflowStatus 
      });
    }

    const now = Date.now();

    // Update order
    await orderRef.update({
      workflowStatus: 'dispatched',
      dispatchedAt: now,
    });

    console.log(`✅ Order ${orderId} marked as dispatched at: ${new Date(now).toISOString()}`);

    res.status(200).json({ 
      success: true, 
      message: 'Order marked as dispatched',
      dispatchedAt: now,
    });

  } catch (error: any) {
    console.error('Error marking order as dispatched:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
