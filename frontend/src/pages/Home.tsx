import { useOverview } from '../api/client';
import { StatCard } from '../components/StatCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import Timeline from '@/components/dashboard/Timeline';
import Transactions from '@/components/dashboard/Transactions';
import MiniStat from '@/components/dashboard/MiniStat';
import { FiUsers, FiTrendingUp, FiBox, FiShoppingBag } from 'react-icons/fi';

export default function Home() {
  const { data, isLoading } = useOverview();
  const salesData = [
    { name: 'Jan', value: 30 },
    { name: 'Feb', value: 50 },
    { name: 'Mar', value: 40 },
    { name: 'Apr', value: 60 },
    { name: 'May', value: 80 },
    { name: 'Jun', value: 75 },
  ];
  const activeUsers = [
    { name: 'Mon', value: 200 },
    { name: 'Tue', value: 350 },
    { name: 'Wed', value: 300 },
    { name: 'Thu', value: 420 },
    { name: 'Fri', value: 380 },
    { name: 'Sat', value: 460 },
    { name: 'Sun', value: 410 },
  ];
  const timeline = [
    { title: 'Design tweaks merged', date: '22 DEC 7:20 PM', color: 'var(--chakra-colors-teal-400)' },
    { title: 'New order #4219423', date: '21 DEC 11:21 PM', color: 'var(--chakra-colors-orange-400)' },
    { title: 'Payments processed', date: '21 DEC 9:28 PM', color: 'var(--chakra-colors-blue-400)' },
    { title: 'New card on file', date: '20 DEC 3:52 PM', color: 'var(--chakra-colors-purple-400)' },
  ];
  const txns = [
    { name: 'Stripe', date: '26 Mar 2022, 13:45', price: '+ $800', direction: 'in' as const },
    { name: 'HubSpot', date: '26 Mar 2022, 12:30', price: '+ $1,700', direction: 'in' as const },
    { name: 'Webflow', date: '26 Mar 2022, 17:00', price: 'Pending', direction: 'pending' as const },
    { name: 'Microsoft', date: '25 Mar 2022, 16:30', price: '- $987', direction: 'out' as const },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--chakra-spacing-lg) - 4px)' }}>
      <Card>
        <CardHeader>Env360</CardHeader>
        <CardBody>
          <p>
            Overview combining Devtron-style app insights and Signadot-style preview environments &
            testing workflows.
          </p>
        </CardBody>
      </Card>
      {isLoading && <div>Loading summary...</div>}
      {data && (
        <>
          <Card>
            <CardHeader>Key Metrics</CardHeader>
            <CardBody>
              <div style={{ display: 'flex', gap: 'var(--chakra-spacing-sm)', flexWrap: 'wrap' }}>
                <StatCard label="Projects" value={data.totalProjects} />
                <StatCard label="Environments" value={data.totalEnvironments} />
                <StatCard label="Services" value={data.totalServices} />
              </div>
            </CardBody>
          </Card>

          {/* <div className="grid-2-1">
            <Card>
              <CardHeader>Sales Overview</CardHeader>
              <CardBody>
                <LineChart data={salesData} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>Active Users</CardHeader>
              <CardBody>
                <BarChart data={activeUsers} />
              </CardBody>
            </Card>
          </div> */}

          <div className="grid-1-1">
            <Card>
              <CardHeader>Timeline</CardHeader>
              <CardBody>
                <Timeline items={timeline} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>Recent Transactions</CardHeader>
              <CardBody>
                <Transactions items={txns} />
              </CardBody>
            </Card>
          </div>

          {/* <div className="grid-4">
            <MiniStat label="Users" value="36,294" helper="+5% vs last week" icon={FiUsers} accent="var(--chakra-colors-primary-500)" />
            <MiniStat label="Sales" value="$4,732" helper="+2% vs last week" icon={FiTrendingUp} accent="var(--chakra-colors-secondary-500)" />
            <MiniStat label="Items" value="1,230" helper="-1% vs last week" icon={FiBox} accent="var(--chakra-colors-primary-700)" />
            <MiniStat label="Orders" value="642" helper="+3% vs last week" icon={FiShoppingBag} accent="var(--chakra-colors-primary-600)" />
          </div> */}

          <Card>
            <CardHeader>Services by Type</CardHeader>
            <CardBody>
              <div style={{ display: 'flex', gap: 'var(--chakra-spacing-sm)', flexWrap: 'wrap' }}>
                <StatCard label="Microservices" value={data.byServiceType.microservice} />
                <StatCard label="Webapps" value={data.byServiceType.webapp} />
                <StatCard label="Databases" value={data.byServiceType.database} />
                <StatCard label="Queues" value={data.byServiceType.queue} />
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
