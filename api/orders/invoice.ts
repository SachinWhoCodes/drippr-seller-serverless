// api/orders/invoice.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { auth, db } from '@/lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

    const { orderId } = req.query;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Fetch order
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderSnap.data();

    // Check access permissions (vendor or admin)
    // For vendors: check if it's their order
    // For admins: allow access to any order
    const isVendor = order?.merchantId === userId;
    // TODO: Check if user is admin
    // const adminSnap = await db.collection('admins').doc(userId).get();
    // const isAdmin = adminSnap.exists;

    if (!isVendor /* && !isAdmin */) {
      return res.status(403).json({ error: 'Unauthorized - not your order' });
    }

    // Check if invoice exists and is ready
    if (order?.invoice?.status === 'ready' && order?.invoice?.url) {
      // Invoice already generated, redirect to it
      return res.redirect(302, order.invoice.url);
    }

    // Check if order is in a state where invoice can be generated
    const allowedStatuses = ['vendor_accepted', 'admin_overdue', 'pickup_assigned', 'dispatched'];
    if (!allowedStatuses.includes(order?.workflowStatus)) {
      return res.status(400).json({ 
        error: 'Invoice not available yet',
        currentStatus: order?.workflowStatus,
        message: 'Invoice can only be generated after vendor accepts the order'
      });
    }

    // Mark invoice as generating
    await orderRef.update({
      'invoice.status': 'generating',
    });

    // TODO: Generate PDF invoice here
    // This is a placeholder - you would integrate with a PDF generation service
    // like PDFKit, Puppeteer, or a service like DocRaptor
    
    // For now, we'll simulate invoice generation
    // In production, you would:
    // 1. Generate PDF with order details
    // 2. Upload to Cloud Storage
    // 3. Get public URL
    // 4. Update order with invoice URL

    const invoiceUrl = `https://storage.example.com/invoices/${orderId}.pdf`;

    // Update order with invoice
    await orderRef.update({
      'invoice.status': 'ready',
      'invoice.url': invoiceUrl,
      'invoice.generatedAt': Date.now(),
    });

    console.log(`✅ Invoice generated for order ${orderId}`);

    // Return the PDF (or redirect)
    // For now, return success message
    res.status(200).json({ 
      success: true, 
      message: 'Invoice generation in progress',
      invoiceUrl: invoiceUrl,
      note: 'Replace this with actual PDF generation and download'
    });

  } catch (error: any) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
