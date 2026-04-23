import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from '@tanstack/react-router';
import {Button, Card, Empty, List, Tag, Typography} from 'antd';
import {CalendarOutlined} from '@ant-design/icons';
import dayjs from 'dayjs';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import {DetailPageHeader} from '@/shared/ui/DetailPageHeader';

const {Text} = Typography;

export function MyEvaluationResultsListPage() {
    const navigate = useNavigate();
    const {data: responses = [], isLoading} = useQuery({
        queryKey: ['eval-my-received'],
        queryFn: () => evaluationApi.listMyReceivedResults(),
    });

    const seasons = useMemo(() => {
        const bySeason = new Map<string, {seasonId: string; seasonName: string; publishedAt?: string; count: number}>();
        for (const r of responses) {
            if (!r.seasonId || !r.seasonResultsPublishedAt) continue;
            const key = r.seasonId;
            const prev = bySeason.get(key);
            if (!prev) {
                bySeason.set(key, {
                    seasonId: r.seasonId,
                    seasonName: r.seasonName ?? `시즌 ${r.seasonId.slice(0, 8)}`,
                    publishedAt: r.seasonResultsPublishedAt,
                    count: 1,
                });
            } else {
                prev.count += 1;
            }
        }
        return [...bySeason.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    }, [responses]);

    return (
        <div className="tw-mx-auto tw-w-full tw-space-y-4">
            <DetailPageHeader
                backTo="/app/evaluations"
                backLabel="평가 허브"
                title="공개된 평가 결과 목록"
                subtitle={<Text type="secondary">공개된 시즌별로 내 평가 결과를 확인할 수 있습니다.</Text>}
                showShare={false}
            />

            <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5">
                {seasons.length === 0 && !isLoading ? (
                    <Empty description="공개된 평가 결과가 없습니다." />
                ) : (
                    <List
                        dataSource={seasons}
                        loading={isLoading}
                        renderItem={(s) => (
                            <List.Item
                                actions={[
                                    <Button
                                        key="view"
                                        type="primary"
                                        onClick={() =>
                                            navigate({
                                                to: '/app/evaluations/seasons/$seasonId/my-result',
                                                params: {seasonId: s.seasonId},
                                            })
                                        }
                                    >
                                        결과 보기
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={<span className="tw-font-semibold">{s.seasonName}</span>}
                                    description={
                                        <div className="tw-flex tw-items-center tw-gap-2">
                                            <span className="tw-inline-flex tw-items-center tw-gap-1 tw-text-slate-500">
                                                <CalendarOutlined/>
                                                {s.publishedAt ? dayjs(s.publishedAt).format('YYYY-MM-DD') : '-'}
                                            </span>
                                            <Tag className="!tw-m-0">{s.count}건</Tag>
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Card>
        </div>
    );
}

export default MyEvaluationResultsListPage;
