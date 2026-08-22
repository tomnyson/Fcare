import { SectionGradesView } from '../../../../../components/master-data/section-grades-view';

export default async function SectionGradesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SectionGradesView sectionId={id} />;
}
