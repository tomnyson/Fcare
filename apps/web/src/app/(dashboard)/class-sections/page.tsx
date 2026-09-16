import { Suspense } from 'react';
import { ClassesView } from '../../../components/class-sections/classes-view';

export default function ClassSectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-muted">
          Đang tải danh sách lớp học...
        </div>
      }
    >
      <ClassesView />
    </Suspense>
  );
}
