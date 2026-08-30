import { Connection } from '../models/Connection.js';
import { AccessToken } from '../models/AccessToken.js';
import { User } from '../models/User.js';
import { logOperation } from '../lib/request-context.js';

export async function listConnections(req, res, next) {
  try {
    const connections = await Connection.find({ userId: req.user._id }).sort({ connectedAt: -1 }).lean();
    res.json({
      connections: connections.map((connection) => ({
        ...connection,
        authorizedAs: req.user.role
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeConnection(req, res, next) {
  try {
    const { clientId } = req.params;
    await Connection.deleteOne({ userId: req.user._id, clientId });
    await AccessToken.updateMany({ userId: req.user._id, clientId }, { revoked: true });

    logOperation('info', 'oauth.connection.revoked', {
      userId: String(req.user._id),
      clientId
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function adminListConnections(req, res, next) {
  try {
    const connections = await Connection.find().sort({ connectedAt: -1 }).lean();
    const userIds = [...new Set(connections.map((item) => String(item.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));

    res.json({
      connections: connections.map((connection) => {
        const owner = usersById.get(String(connection.userId));
        return {
          ...connection,
          user: owner
            ? {
                id: String(owner._id),
                name: owner.name,
                email: owner.email,
                role: owner.role
              }
            : null,
          authorizedAs: owner?.role || 'unknown'
        };
      })
    });
  } catch (err) {
    next(err);
  }
}
