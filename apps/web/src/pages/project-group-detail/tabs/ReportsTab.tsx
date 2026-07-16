import ReportWorkbench from '../../workspace-detail/panels/ReportWorkbench';

interface Props {
  groupId: string;
  canManage: boolean;
}

/** 项目群维度周报/月报面板。AI 生成优先取子项目周报，缺失则回退项目动态。 */
export default function ReportsTab({ groupId, canManage }: Props) {
  return (
    <ReportWorkbench
      basePath={`/project-groups/${groupId}/reports`}
      canManage={canManage}
      emptyHint="选择或新建一份项目群汇总报告"
    />
  );
}
