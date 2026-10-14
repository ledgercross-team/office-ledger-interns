import { notFound } from 'next/navigation';
import { DesignSystemGallery } from './gallery';

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystemGallery />;
}
