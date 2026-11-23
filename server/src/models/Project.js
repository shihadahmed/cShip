import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    repoFullName: {
      type: String,
      required: true,
    },
    defaultBranch: {
      type: String,
      default: 'main',
    },
    subdomain: {
      type: String,
      unique: true,
      sparse: true,
    },
    envVars: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ userId: 1 });
projectSchema.index({ repoFullName: 1 });

export default mongoose.model('Project', projectSchema);