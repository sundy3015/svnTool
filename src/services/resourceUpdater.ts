import { SvnProjectService } from './svnProjectService.js';
import type { SvnProjectConfig, SyncProjectResult } from '../svn/svnTypes.js';

/**
 * 为后续 Unity 打包资源更新流程预留的轻量扩展点。
 */
export class ResourceUpdater {
  /**
   * 创建一个基于项目同步服务的资源更新器。
   */
  public constructor(private readonly projectService: SvnProjectService) {}

  /**
   * 委托 SvnProjectService 更新单个项目资源。
   */
  public async updateResources(project: SvnProjectConfig): Promise<SyncProjectResult> {
    return this.projectService.syncProject(project);
  }
}
