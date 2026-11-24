import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'user.login', 'user.logout',
        'project.create', 'project.update', 'project.delete',
        'project.deploy', 'project.redeploy', 'project.rollback',
        'project.webhook.register', 'project.webhook.unregister',
        'settings.update',
      ],
    },
    resource: {
      type: String,
      required: true,
      enum: ['user', 'project', 'deployment', 'webhook', 'settings'],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Prevent updates
auditLogSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateOne', function() {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateMany', function() {
  throw new Error('Audit logs are immutable');
});

export default mongoose.model('AuditLog', auditLogSchema);