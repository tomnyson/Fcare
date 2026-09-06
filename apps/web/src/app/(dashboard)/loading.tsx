import { PageSkeleton } from '../../components/dashboard/shell-skeleton';

/**
 * Fallback lúc Next tải chunk của route con. Sidebar/topbar vẫn đứng yên vì
 * layout không bị thay — chỉ vùng nội dung đổi sang skeleton.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy aria-label="Đang tải nội dung trang">
      <PageSkeleton />
    </div>
  );
}
