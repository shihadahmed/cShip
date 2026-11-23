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
    slug: {
      type: String,
      sparse: true,
    },
    repoFullName: {
      type: String,
      required: true,
    },
    repo: {
      fullName: { type: String },
      htmlUrl: { type: String },
      cloneUrl: { type: String },
      defaultBranch: { type: String },
    },
    defaultBranch: {
      type: String,
      default: 'main',
    },
    branch: {
      type: String,
    },
    framework: {
      type: String,
      enum: ['nextjs', 'react', 'express', 'static'],
      default: 'nextjs',
    },
    domain: {
      type: String,
    },
    subdomain: {
      type: String,
      sparse: true,
    },
    documentRoot: {
      type: String,
    },
    projectRoot: {
      type: String,
    },
    buildCommand: {
      type: String,
      default: 'npm run build',
    },
    installCommand: {
      type: String,
      default: 'npm ci',
    },
    startCommand: {
      type: String,
      default: 'npm start',
    },
    outputDirectory: {
      type: String,
      default: '.next',
    },
    envVars: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    passenger: {
      registered: { type: Boolean, default: false },
      applicationName: { type: String },
      baseUri: { type: String },
    },
    webhook: {
      id: { type: String },
      secret: { type: String },
      active: { type: Boolean, default: false },
    },
    lastDeployment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deployment',
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ userId: 1 }, { name: 'project_userId' });
projectSchema.index({ repoFullName: 1 }, { name: 'project_repoFullName' });
projectSchema.index({ slug: 1 }, { unique: true, sparse: true, name: 'project_slug' });
projectSchema.index({ subdomain: 1 }, { unique: true, sparse: true, name: 'project_subdomain' });

export default mongoose.model('Project', projectSchema);