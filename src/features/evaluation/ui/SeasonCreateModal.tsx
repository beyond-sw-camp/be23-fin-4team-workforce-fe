import {useMutation} from '@tanstack/react-query';
import {App, Button, DatePicker, Form, Input, Modal, Select} from 'antd';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {CreateSeasonPayload} from '@/features/evaluation/model/types';
import {AppButton} from '@/shared/ui/AppButton';

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
};

export function SeasonCreateModal({open, onClose, onCreated}: Props) {
    const {message} = App.useApp();
    const [form] = Form.useForm();

    const createMut = useMutation({
        mutationFn: (body: CreateSeasonPayload) => evaluationApi.createSeason(body),
        onSuccess: () => {
            message.success(L.seasonCreated);
            form.resetFields();
            onCreated();
            onClose();
        },
    });

    return (
        <Modal title={L.seasonAdd} open={open} onCancel={onClose} width={520} destroyOnHidden footer={null}>
            <Form
                form={form}
                layout="vertical"
                onFinish={(v) => {
                    // scheduleJson 은 비어 있어도 BE 에서 허용 — 상세 편집은 시즌 상세 화면에서.
                    const schedule = {
                        self: {startDate: '', endDate: ''},
                        peer: {startDate: '', endDate: ''},
                        downward: {startDate: '', endDate: ''},
                        upward: {startDate: '', endDate: ''},
                    };
                    createMut.mutate({
                        name: v.name,
                        type: v.type,
                        startDate: v.period[0].format('YYYY-MM-DD'),
                        endDate: v.period[1].format('YYYY-MM-DD'),
                        resultPublishDate: v.resultPublishDate?.format('YYYY-MM-DD'),
                        scheduleJson: JSON.stringify(schedule),
                    });
                }}
            >
                <Form.Item name="name" label={L.seasonName} rules={[{required: true}]}>
                    <Input />
                </Form.Item>
                <Form.Item name="type" label={L.seasonType} rules={[{required: true}]}>
                    <Select
                        options={[
                            {value: 'ANNUAL', label: L.seasonTypeAnnual},
                            {value: 'HALF_YEAR', label: L.seasonTypeHalfYear},
                            {value: 'QUARTER', label: L.seasonTypeQuarter},
                        ]}
                    />
                </Form.Item>
                <Form.Item name="period" label={L.seasonPeriod} rules={[{required: true}]}>
                    <DatePicker.RangePicker className="tw-w-full" />
                </Form.Item>
                <Form.Item name="resultPublishDate" label={L.seasonResultPublishDate}>
                    <DatePicker className="tw-w-full" />
                </Form.Item>
                <div className="tw-flex tw-justify-end tw-gap-2">
                    <Button onClick={onClose}>{L.cancel}</Button>
                    <AppButton variant="primary" htmlType="submit" loading={createMut.isPending}>
                        {L.save}
                    </AppButton>
                </div>
            </Form>
        </Modal>
    );
}
