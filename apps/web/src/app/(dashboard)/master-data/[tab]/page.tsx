import { redirect } from 'next/navigation';
import {
  MappingView,
  type MappingTabKey,
} from '../../../../components/master-data/mapping-view';
import { MasterDataView } from '../../../../components/master-data/master-data-view';
import { isMasterDataTabKey } from '../../../../lib/master-data-tabs';

const MAPPING_TABS: readonly string[] = ['department-aliases', 'class-major-rules'];

export default async function MasterDataTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!isMasterDataTabKey(tab)) {
    redirect('/master-data/departments');
  }
  if (MAPPING_TABS.includes(tab)) {
    return <MappingView tab={tab as MappingTabKey} />;
  }
  return <MasterDataView tab={tab} />;
}
