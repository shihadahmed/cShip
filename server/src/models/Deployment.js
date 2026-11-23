import mongoose from 'mongoose';

const deploymentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    commitSha: {
      type: String,
      required: true,
    },
    branch: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'building', 'ready', 'failed', 'cancelled'],
      default: 'queued',
    },
    logs: {
      type: String,
      default: '',
    },
    startedAt: {
      type: Date,
    },
    finishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

deploymentSchema.index({ projectId: 1 });
deploymentSchema.index({ status: 1 });

export default mongoose.model('Deployment', deploymentSchema);