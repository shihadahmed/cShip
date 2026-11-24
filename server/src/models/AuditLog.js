import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Allow null for failed auth attempts
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Auth events
        'user.login', 'user.logout', 'user.login_failed', 'user.login_denied',
        'user.token_refreshed', 'user.session_expired',
        // Project events
        'project.create', 'project.update', 'project.delete',
        'project.deploy', 'project.redeploy', 'project.rollback',
        'project.webhook.register', 'project.webhook.unregister',
        'settings.update',
        // Security events
        'security.unauthorized', 'security.forbidden', 'security.rate_limited',
        'security.invalid_csrf', 'security.invalid_input', 'security.suspicious_activity',
      ],
    },
    resource: {
      type: String,
      required: true,
      enum: ['user', 'project', 'deployment', 'webhook', 'settings', 'security'],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: { type: String },
    userAgent: { type: String },
    // For security events: severity level
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });

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