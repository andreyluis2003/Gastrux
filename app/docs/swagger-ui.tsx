'use client';

// @ts-nocheck
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI: any = dynamic(() => import('swagger-ui-react') as any, { ssr: false });

interface Props {
  spec: any;
}

export default function ReactSwaggerUI({ spec }: Props) {
  return (
    <div className="swagger-container max-w-6xl mx-auto p-4">
      <SwaggerUI spec={spec} />
    </div>
  );
}
