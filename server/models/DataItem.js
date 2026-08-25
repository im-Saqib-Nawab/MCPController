import mongoose from 'mongoose';

/**
 * Practice records that MCP tools create, read, update, and delete.
 * Each document belongs to the user who authorized the MCP client.
 */
const dataItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' }
  },
  { timestamps: true }
);

export const DataItem = mongoose.model('DataItem', dataItemSchema);
