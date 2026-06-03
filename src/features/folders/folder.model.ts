import mongoose, { Schema, Document } from "mongoose";

export interface IFolder extends Document {
  name: string;
  user: mongoose.Types.ObjectId;
  parentFolder: mongoose.Types.ObjectId | null;
  path: string; // Used for quick breadcrumbs (e.g., "Projects/Q4")
  isPinned: boolean;
  isAIGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema: Schema = new Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    user: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    parentFolder: { 
      type: Schema.Types.ObjectId, 
      ref: "Folder", 
      default: null // Null means it sits at the root of the user's drive
    },
    path: { 
      type: String, 
      default: "" 
    }, 
    // to make random file in the top of the list 
    isPinned: { 
      type: Boolean, 
      default: false 
    }, 
    isAIGenerated: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true 
  }
);

// Performance upgrade: Indexing makes fetching a user's specific folder instantly fast
FolderSchema.index({ user: 1, parentFolder: 1 });

export default mongoose.model<IFolder>("Folder", FolderSchema);