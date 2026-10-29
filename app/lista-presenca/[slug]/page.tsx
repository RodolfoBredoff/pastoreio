'use client';

import { useParams } from 'next/navigation';
import { PublicAttendanceView } from '@/components/lista-presenca/public-attendance-view';
import { apiAttendanceSource } from '@/components/lista-presenca/attendance-sources';

export default function ListaPresencaPublicPage() {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  return <PublicAttendanceView slug={slug} source={apiAttendanceSource} />;
}
