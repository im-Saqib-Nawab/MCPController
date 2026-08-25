import { Connection } from '../models/Connection.js';
import { AccessToken } from '../models/AccessToken.js';

export async function listConnections(req, res, next) {
  try {
    const connections = await Connection.find({ userId: req.user._id }).sort({ connectedAt: -1 }).lean();
    res.json({ connections });
  } catch (err) {
    next(err);
  }
}

export async function revokeConnection(req, res, next) {
  try {
    const { clientId } = req.params;
    await Connection.deleteOne({ userId: req.user._id, clientId });
    await AccessToken.updateMany({ userId: req.user._id, clientId }, { revoked: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
