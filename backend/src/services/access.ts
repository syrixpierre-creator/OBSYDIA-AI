import type { Request } from "express";
import { Project, TeamMember } from "../models/index.js";
import { forbidden, notFound } from "../lib/errors.js";
import { objectId, parse } from "../lib/validate.js";

export type Access = "read" | "write" | "owner";

export async function projectAccess(req: Request, id: string, need: Access) {
  const project = await Project.findById(parse(objectId, id));
  if (!project) throw notFound("project_not_found");
  const uid = String(req.user._id);
  if (String(project.userId) === uid) return { project, role: "owner" as const };
  if (need !== "owner" && project.teamId) {
    const member = await TeamMember.findOne({ teamId: project.teamId, userId: req.user._id }).lean<any>();
    if (member) {
      if (need === "read") return { project, role: member.role as "editor" | "viewer" };
      if (need === "write" && member.role === "editor") return { project, role: "editor" as const };
      throw forbidden("insufficient_team_permission");
    }
  }
  throw notFound("project_not_found");
}
