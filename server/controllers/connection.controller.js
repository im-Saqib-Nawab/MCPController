import { Connection } from '../models/Connection.js';
import { AccessToken } from '../models/AccessToken.js';
import { User } from '../models/User.js';
import { logAudit } from '../lib/audit-log.js';
import { paginateQuery } from '../lib/pagination.js';

export async function listConnections(req, res, next) {
  try {
    const { items, pagination } = await paginateQuery(
      Connection,
      { userId: req.user._id },
      { sort: { connectedAt: -1 }, pagination: req.query }
    );

    res.json({
      connections: items.map((connection) => ({
        ...connection,
        authorizedAs: req.user.role
      })),
      pagination
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeConnection(req, res, next) {
  req.auditAction = 'Revoke MCP Connection';
  try {
    const { clientId } = req.params;
    await Connection.deleteOne({ userId: req.user._id, clientId });
    await AccessToken.updateMany({ userId: req.user._id, clientId }, { revoked: true });

    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { clientId }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function adminListConnections(req, res, next) {
  try {
    const { items: connections, pagination } = await paginateQuery(
      Connection,
      {},
      { sort: { connectedAt: -1 }, pagination: req.query }
    );

    const userIds = [...new Set(connections.map((item) => String(item.userId)))];
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).lean() : [];
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
      }),
      pagination
    });
  } catch (err) {
    next(err);
  }
}
