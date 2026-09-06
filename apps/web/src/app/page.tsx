import Link from 'next/link';
import { BrandMark } from '../components/ui/brand-mark';

const MODULES = [
  {
    title: 'Đánh giá sinh viên',
    description:
      'Ghi nhận khả năng học tập, thái độ và các vấn đề khác theo thang chuẩn — kèm giải pháp gợi ý cho giảng viên và CTSV.',
    accent: 'border-t-fpt-blue',
  },
  {
    title: 'Nhật ký chăm sóc',
    description:
      'Giảng viên và cán bộ CTSV ghi lại toàn bộ nội dung đã chăm sóc, theo dõi tiến triển của từng sinh viên.',
    accent: 'border-t-fpt-orange',
  },
  {
    title: 'Cảnh báo sớm',
    description:
      'Bốn mức độ khẩn với ma trận thông báo tự động tới đúng người: trưởng bộ môn, đào tạo, CTSV và giảng viên phụ trách.',
    accent: 'border-t-danger',
  },
  {
    title: 'Thống kê học vụ',
    description:
      'Tỉ lệ pass/rớt môn, cấm thi điểm danh, cấm thi thành phần, rớt bảo vệ — theo từng lớp, phục vụ họp bộ môn và báo cáo Đào tạo.',
    accent: 'border-t-success',
  },
] as const;

const PRINCIPLES = [
  'Không lưu trữ CCCD, số điện thoại, email, địa chỉ của sinh viên và giảng viên.',
  'Giảng viên chỉ quản lý sinh viên thuộc bộ môn của mình.',
  'Chỉ trưởng bộ môn, cán bộ Đào tạo và CTSV được import/export dữ liệu.',
  'Mọi phiên đăng nhập đều ký cam kết không chia sẻ dữ liệu.',
] as const;

export default function Home() {
  return (
    <>
      <header className="bg-fpt-blue-900 text-white">
        <nav
          aria-label="Điều hướng chính"
          className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <BrandMark size={36} priority />
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
              FCare
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-fpt-orange px-5 py-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)] hover:bg-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Đăng nhập
          </Link>
        </nav>
      </header>

      <main>
        <section
          aria-labelledby="hero-heading"
          className="bg-gradient-to-b from-fpt-blue-900 via-fpt-blue-700 to-fpt-blue text-white"
        >
          <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
            <p className="mb-4 inline-block rounded-full border border-white/25 bg-white/10 px-4 py-1 text-xs font-medium uppercase tracking-widest">
              FPT Education
            </p>
            <h1
              id="hero-heading"
              className="max-w-3xl font-[family-name:var(--font-display)] text-[length:var(--text-hero)] font-extrabold leading-[1.08] tracking-tight"
            >
              Chăm sóc sinh viên <span className="text-fpt-orange">đúng người</span>, cảnh báo{' '}
              <span className="text-fpt-orange">đúng lúc</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
              FCare giúp giảng viên, trưởng bộ môn và cán bộ CTSV theo dõi tình hình học tập, ghi
              nhận chăm sóc và phát hiện sớm sinh viên cần hỗ trợ — trên nền tảng dữ liệu tối giản,
              tôn trọng quyền riêng tư.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="rounded-md bg-fpt-orange px-7 py-3 font-semibold shadow-lg shadow-fpt-orange/25 transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:bg-fpt-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Vào hệ thống
              </Link>
              <a
                href="#modules"
                className="rounded-md border border-white/30 px-7 py-3 font-medium transition-colors duration-[var(--duration-fast)] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Tìm hiểu thêm
              </a>
            </div>
          </div>
        </section>

        <section
          id="modules"
          aria-labelledby="modules-heading"
          className="py-[var(--space-section)]"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2
              id="modules-heading"
              className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-fpt-blue-900"
            >
              Bốn trụ cột nghiệp vụ
            </h2>
            <p className="mt-3 max-w-xl text-muted">
              Thiết kế bám sát quy trình chăm sóc sinh viên của FPT Polytechnic.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {MODULES.map((mod) => (
                <article
                  key={mod.title}
                  className={`rounded-[var(--radius-card)] border border-border ${mod.accent} border-t-4 bg-white p-7 shadow-[var(--shadow-card)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-expo)] hover:-translate-y-1`}
                >
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-fpt-blue-900">
                    {mod.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-muted">{mod.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="privacy-heading"
          className="border-y border-border bg-fpt-orange-50 py-[var(--space-section)]"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[2fr_3fr]">
            <div>
              <h2
                id="privacy-heading"
                className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-fpt-blue-900"
              >
                Bảo mật là mặc định
              </h2>
              <p className="mt-3 text-muted">
                Tuân thủ nghiêm quy định dữ liệu của nhà trường — hệ thống chỉ lưu những gì được
                phép.
              </p>
            </div>
            <ul className="space-y-4">
              {PRINCIPLES.map((principle) => (
                <li key={principle} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-fpt-blue text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                  <span className="leading-relaxed">{principle}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-fpt-blue-900 py-10 text-sm text-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
          <p>© 2026 FPT Education — FCare.</p>
          <p>Dữ liệu nội bộ. Không chia sẻ ra bên ngoài.</p>
        </div>
      </footer>
    </>
  );
}
