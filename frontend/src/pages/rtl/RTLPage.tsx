import { Card, CardBody, CardHeader } from '@/components/ui/Card';

export default function RTLPage() {
  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader>صفحة RTL</CardHeader>
        <CardBody>
          <p>
            هذا مثال على صفحة من اليمين إلى اليسار. يمكنك استخدام هذا لتجربة تخطيطات RTL
            والتأكد من أن المكونات تبدو بشكل صحيح.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}


