import { redirect } from 'next/navigation';
import { MasterDataView } from '../../../../components/master-data/master-data-view';
import { isMasterDataTabKey } from '../../../../lib/master-data-tabs';

export default async function MasterDataTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!isMasterDataTabKey(tab)) {
    redirect('/master-data/departments');
  }
  return <MasterDataView tab={tab} />;
}
