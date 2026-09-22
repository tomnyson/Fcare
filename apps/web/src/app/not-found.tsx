import type { Metadata } from 'next';
import { PageNotFound } from '../components/errors/error-screen';

export const metadata: Metadata = { title: 'Không tìm thấy trang — FCare' };

export default function NotFound() {
  return <PageNotFound />;
}
