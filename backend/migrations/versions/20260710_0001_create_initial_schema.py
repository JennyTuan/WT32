"""create initial schema

Revision ID: 20260710_0001
Revises:
Create Date: 2026-07-10 14:16:24.697960
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Alembic 版本标识。
revision: str = '20260710_0001'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """创建 WT32 初始数据库结构。"""
    op.create_table('corner_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('template_name', sa.String(length=100), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('config_json', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_corner_configs_id'), 'corner_configs', ['id'], unique=False)
    op.create_table('dose_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('threshold_action', sa.String(length=20), nullable=False),
    sa.Column('aec_enabled', sa.Boolean(), nullable=False),
    sa.Column('aec_noise_level', sa.String(length=10), nullable=False),
    sa.Column('audit_threshold_exceed', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('drl_entries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('body_part', sa.String(length=50), nullable=False),
    sa.Column('age_group', sa.String(length=20), nullable=False),
    sa.Column('ctdi_ref', sa.Float(), nullable=False),
    sa.Column('dlp_ref', sa.Float(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('body_part', 'age_group', name='uq_drl_part_age')
    )
    op.create_index(op.f('ix_drl_entries_age_group'), 'drl_entries', ['age_group'], unique=False)
    op.create_index(op.f('ix_drl_entries_body_part'), 'drl_entries', ['body_part'], unique=False)
    op.create_index(op.f('ix_drl_entries_id'), 'drl_entries', ['id'], unique=False)
    op.create_table('patients',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('last_name', sa.String(length=50), nullable=True),
    sa.Column('first_name', sa.String(length=50), nullable=True),
    sa.Column('patient_id', sa.String(length=50), nullable=False),
    sa.Column('id_number', sa.String(length=50), nullable=True),
    sa.Column('gender', sa.String(length=20), nullable=False),
    sa.Column('age', sa.Integer(), nullable=False),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('height', sa.Float(), nullable=True),
    sa.Column('weight', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_patients_id'), 'patients', ['id'], unique=False)
    op.create_index(op.f('ix_patients_patient_id'), 'patients', ['patient_id'], unique=True)
    op.create_table('protocols',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('body_part', sa.String(length=100), nullable=False),
    sa.Column('age_group', sa.String(length=20), nullable=False),
    sa.Column('patient_weight', sa.String(length=50), nullable=False),
    sa.Column('patient_position', sa.String(length=10), nullable=False),
    sa.Column('table_direction', sa.String(length=10), nullable=False),
    sa.Column('acquisition_type', sa.String(length=20), nullable=False),
    sa.Column('scan_mode', sa.String(length=20), nullable=False),
    sa.Column('is_4d', sa.Boolean(), nullable=False),
    sa.Column('is_enhance', sa.Boolean(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_factory', sa.Boolean(), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_protocols_acquisition_type'), 'protocols', ['acquisition_type'], unique=False)
    op.create_index(op.f('ix_protocols_age_group'), 'protocols', ['age_group'], unique=False)
    op.create_index(op.f('ix_protocols_id'), 'protocols', ['id'], unique=False)
    op.create_index(op.f('ix_protocols_name'), 'protocols', ['name'], unique=False)
    op.create_index(op.f('ix_protocols_scan_mode'), 'protocols', ['scan_mode'], unique=False)
    op.create_table('user_roles',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('permissions', sa.Text(), nullable=False),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('code')
    )
    op.create_index(op.f('ix_user_roles_code'), 'user_roles', ['code'], unique=False)
    op.create_table('contrast_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('protocol_id', sa.Integer(), nullable=False),
    sa.Column('contrast_agent', sa.String(length=100), nullable=False),
    sa.Column('concentration', sa.Float(), nullable=False),
    sa.Column('total_volume', sa.Float(), nullable=False),
    sa.Column('injection_rate', sa.Float(), nullable=False),
    sa.Column('saline_volume', sa.Float(), nullable=False),
    sa.Column('saline_rate', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['protocol_id'], ['protocols.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contrast_configs_id'), 'contrast_configs', ['id'], unique=False)
    op.create_index(op.f('ix_contrast_configs_protocol_id'), 'contrast_configs', ['protocol_id'], unique=True)
    op.create_table('scan_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('protocol_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('session_name', sa.String(length=120), nullable=True),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('body_part', sa.String(length=100), nullable=False),
    sa.Column('age_group', sa.String(length=20), nullable=False),
    sa.Column('patient_weight', sa.String(length=50), nullable=False),
    sa.Column('patient_position', sa.String(length=10), nullable=False),
    sa.Column('table_direction', sa.String(length=10), nullable=False),
    sa.Column('acquisition_type', sa.String(length=20), nullable=False),
    sa.Column('scan_mode', sa.String(length=20), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['protocol_id'], ['protocols.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scan_sessions_acquisition_type'), 'scan_sessions', ['acquisition_type'], unique=False)
    op.create_index(op.f('ix_scan_sessions_age_group'), 'scan_sessions', ['age_group'], unique=False)
    op.create_index(op.f('ix_scan_sessions_id'), 'scan_sessions', ['id'], unique=False)
    op.create_index(op.f('ix_scan_sessions_name'), 'scan_sessions', ['name'], unique=False)
    op.create_index(op.f('ix_scan_sessions_patient_id'), 'scan_sessions', ['patient_id'], unique=False)
    op.create_index(op.f('ix_scan_sessions_protocol_id'), 'scan_sessions', ['protocol_id'], unique=False)
    op.create_index(op.f('ix_scan_sessions_scan_mode'), 'scan_sessions', ['scan_mode'], unique=False)
    op.create_index(op.f('ix_scan_sessions_status'), 'scan_sessions', ['status'], unique=False)
    op.create_table('series',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('protocol_id', sa.Integer(), nullable=False),
    sa.Column('series_order', sa.Integer(), nullable=False),
    sa.Column('series_type', sa.String(length=20), nullable=False),
    sa.Column('series_label', sa.String(length=100), nullable=False),
    sa.Column('contrast_delay', sa.Float(), nullable=True),
    sa.Column('trigger_mode', sa.String(length=30), nullable=True),
    sa.Column('tracking_threshold', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['protocol_id'], ['protocols.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('protocol_id', 'series_order', name='uq_protocol_series_order')
    )
    op.create_index(op.f('ix_series_id'), 'series', ['id'], unique=False)
    op.create_index(op.f('ix_series_protocol_id'), 'series', ['protocol_id'], unique=False)
    op.create_table('user_accounts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=50), nullable=False),
    sa.Column('display_name', sa.String(length=100), nullable=False),
    sa.Column('employee_id', sa.String(length=50), nullable=True),
    sa.Column('department', sa.String(length=80), nullable=True),
    sa.Column('title', sa.String(length=80), nullable=True),
    sa.Column('role_code', sa.String(length=40), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('email', sa.String(length=120), nullable=True),
    sa.Column('login_allowed', sa.Boolean(), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('password_reset_required', sa.Boolean(), nullable=False),
    sa.Column('credential_version', sa.Integer(), nullable=False),
    sa.Column('failed_attempts', sa.Integer(), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('password_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['role_code'], ['user_roles.code'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_accounts_employee_id'), 'user_accounts', ['employee_id'], unique=True)
    op.create_index(op.f('ix_user_accounts_id'), 'user_accounts', ['id'], unique=False)
    op.create_index(op.f('ix_user_accounts_role_code'), 'user_accounts', ['role_code'], unique=False)
    op.create_index(op.f('ix_user_accounts_status'), 'user_accounts', ['status'], unique=False)
    op.create_index(op.f('ix_user_accounts_username'), 'user_accounts', ['username'], unique=True)
    op.create_table('axial_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('slice_interval', sa.Float(), nullable=False),
    sa.Column('rotation_time', sa.Float(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.Column('auto_ma', sa.Boolean(), nullable=False),
    sa.Column('ma_min', sa.Float(), nullable=True),
    sa.Column('ma_max', sa.Float(), nullable=True),
    sa.Column('step_count', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('series_id')
    )
    op.create_index(op.f('ix_axial_params_id'), 'axial_params', ['id'], unique=False)
    op.create_table('fourd_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('breathing_mode', sa.String(length=30), nullable=False),
    sa.Column('phase_count', sa.Integer(), nullable=False),
    sa.Column('acquisition_time', sa.Float(), nullable=False),
    sa.Column('trigger_threshold', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fourd_configs_id'), 'fourd_configs', ['id'], unique=False)
    op.create_index(op.f('ix_fourd_configs_series_id'), 'fourd_configs', ['series_id'], unique=True)
    op.create_table('gating_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('breathing_mode', sa.String(length=30), nullable=False),
    sa.Column('target_phase', sa.String(length=20), nullable=True),
    sa.Column('threshold_normalized', sa.Float(), nullable=True),
    sa.Column('trigger_direction', sa.String(length=10), nullable=True),
    sa.Column('wait_timeout_s', sa.Float(), nullable=True),
    sa.Column('trigger_delay_ms', sa.Integer(), nullable=False),
    sa.Column('stability_cv_threshold', sa.Float(), nullable=False),
    sa.Column('baseline_drift_mm_threshold', sa.Float(), nullable=False),
    sa.Column('breath_hold_timeout_s', sa.Float(), nullable=True),
    sa.Column('breath_hold_amplitude_tolerance_mm', sa.Float(), nullable=True),
    sa.Column('phase_start_pct', sa.Float(), server_default='0', nullable=True),
    sa.Column('phase_end_pct', sa.Float(), server_default='0', nullable=True),
    sa.Column('max_triggers_per_cycle', sa.Integer(), server_default='1', nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gating_configs_id'), 'gating_configs', ['id'], unique=False)
    op.create_index(op.f('ix_gating_configs_series_id'), 'gating_configs', ['series_id'], unique=True)
    op.create_table('helical_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('pitch', sa.Float(), nullable=False),
    sa.Column('rotation_time', sa.Float(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.Column('auto_ma', sa.Boolean(), nullable=False),
    sa.Column('ma_min', sa.Float(), nullable=True),
    sa.Column('ma_max', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('series_id')
    )
    op.create_index(op.f('ix_helical_params_id'), 'helical_params', ['id'], unique=False)
    op.create_table('recon_series',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('recon_name', sa.String(length=100), nullable=False),
    sa.Column('recon_type', sa.String(length=20), nullable=False),
    sa.Column('kernel', sa.String(length=50), nullable=False),
    sa.Column('matrix', sa.Integer(), nullable=False),
    sa.Column('window_width', sa.Integer(), nullable=False),
    sa.Column('window_level', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('increment', sa.Float(), nullable=True),
    sa.Column('recon_fov', sa.Float(), nullable=True),
    sa.Column('center_x', sa.Float(), nullable=True),
    sa.Column('center_y', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recon_series_id'), 'recon_series', ['id'], unique=False)
    op.create_index(op.f('ix_recon_series_series_id'), 'recon_series', ['series_id'], unique=False)
    op.create_table('scan_session_contrast_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_id', sa.Integer(), nullable=False),
    sa.Column('template_contrast_config_id', sa.Integer(), nullable=True),
    sa.Column('contrast_agent', sa.String(length=100), nullable=False),
    sa.Column('concentration', sa.Float(), nullable=False),
    sa.Column('total_volume', sa.Float(), nullable=False),
    sa.Column('injection_rate', sa.Float(), nullable=False),
    sa.Column('saline_volume', sa.Float(), nullable=False),
    sa.Column('saline_rate', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_contrast_config_id'], ['contrast_configs.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scan_session_contrast_configs_id'), 'scan_session_contrast_configs', ['id'], unique=False)
    op.create_index(op.f('ix_scan_session_contrast_configs_scan_session_id'), 'scan_session_contrast_configs', ['scan_session_id'], unique=True)
    op.create_table('scan_session_series',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_id', sa.Integer(), nullable=False),
    sa.Column('template_series_id', sa.Integer(), nullable=True),
    sa.Column('series_order', sa.Integer(), nullable=False),
    sa.Column('series_type', sa.String(length=20), nullable=False),
    sa.Column('series_label', sa.String(length=100), nullable=False),
    sa.Column('contrast_delay', sa.Float(), nullable=True),
    sa.Column('trigger_mode', sa.String(length=30), nullable=True),
    sa.Column('tracking_threshold', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_series_id'], ['series.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scan_session_id', 'series_order', name='uq_scan_session_series_order')
    )
    op.create_index(op.f('ix_scan_session_series_id'), 'scan_session_series', ['id'], unique=False)
    op.create_index(op.f('ix_scan_session_series_scan_session_id'), 'scan_session_series', ['scan_session_id'], unique=False)
    op.create_index(op.f('ix_scan_session_series_template_series_id'), 'scan_session_series', ['template_series_id'], unique=False)
    op.create_table('system_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('level', sa.String(length=10), nullable=False),
    sa.Column('source', sa.String(length=50), nullable=False),
    sa.Column('event', sa.String(length=50), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('details', sa.Text(), nullable=True),
    sa.Column('scan_session_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_logs_event'), 'system_logs', ['event'], unique=False)
    op.create_index(op.f('ix_system_logs_id'), 'system_logs', ['id'], unique=False)
    op.create_index(op.f('ix_system_logs_level'), 'system_logs', ['level'], unique=False)
    op.create_index(op.f('ix_system_logs_scan_session_id'), 'system_logs', ['scan_session_id'], unique=False)
    op.create_index(op.f('ix_system_logs_source'), 'system_logs', ['source'], unique=False)
    op.create_index(op.f('ix_system_logs_timestamp'), 'system_logs', ['timestamp'], unique=False)
    op.create_table('topogram_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('series_id', sa.Integer(), nullable=False),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('tube_angle', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['series_id'], ['series.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('series_id')
    )
    op.create_index(op.f('ix_topogram_params_id'), 'topogram_params', ['id'], unique=False)
    op.create_table('breathing_training_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('fourd_config_id', sa.Integer(), nullable=False),
    sa.Column('training_duration', sa.Float(), nullable=False),
    sa.Column('target_amplitude', sa.Float(), nullable=False),
    sa.Column('tolerance_range', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['fourd_config_id'], ['fourd_configs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fourd_config_id')
    )
    op.create_index(op.f('ix_breathing_training_params_id'), 'breathing_training_params', ['id'], unique=False)
    op.create_table('dose_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('scanned_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=True),
    sa.Column('scan_session_id', sa.Integer(), nullable=True),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=True),
    sa.Column('patient_name_snapshot', sa.String(length=100), nullable=True),
    sa.Column('patient_id_snapshot', sa.String(length=50), nullable=True),
    sa.Column('protocol_name_snapshot', sa.String(length=100), nullable=True),
    sa.Column('series_order', sa.Integer(), nullable=True),
    sa.Column('series_type', sa.String(length=20), nullable=False),
    sa.Column('series_label', sa.String(length=100), nullable=True),
    sa.Column('body_part', sa.String(length=100), nullable=True),
    sa.Column('acquisition_type', sa.String(length=20), nullable=True),
    sa.Column('scan_mode', sa.String(length=20), nullable=True),
    sa.Column('kv', sa.Integer(), nullable=True),
    sa.Column('ma', sa.Float(), nullable=True),
    sa.Column('rotation_time', sa.Float(), nullable=True),
    sa.Column('pitch', sa.Float(), nullable=True),
    sa.Column('scan_length', sa.Float(), nullable=True),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.Column('operator', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['scan_session_id'], ['scan_sessions.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_dose_logs_id'), 'dose_logs', ['id'], unique=False)
    op.create_index(op.f('ix_dose_logs_patient_id'), 'dose_logs', ['patient_id'], unique=False)
    op.create_index(op.f('ix_dose_logs_patient_id_snapshot'), 'dose_logs', ['patient_id_snapshot'], unique=False)
    op.create_index(op.f('ix_dose_logs_scan_session_id'), 'dose_logs', ['scan_session_id'], unique=False)
    op.create_index(op.f('ix_dose_logs_scan_session_series_id'), 'dose_logs', ['scan_session_series_id'], unique=False)
    op.create_index(op.f('ix_dose_logs_scanned_at'), 'dose_logs', ['scanned_at'], unique=False)
    op.create_index(op.f('ix_dose_logs_series_type'), 'dose_logs', ['series_type'], unique=False)
    op.create_table('scan_session_axial_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_param_id', sa.Integer(), nullable=True),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('slice_interval', sa.Float(), nullable=False),
    sa.Column('rotation_time', sa.Float(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.Column('auto_ma', sa.Boolean(), nullable=False),
    sa.Column('ma_min', sa.Float(), nullable=True),
    sa.Column('ma_max', sa.Float(), nullable=True),
    sa.Column('step_count', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_param_id'], ['axial_params.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scan_session_series_id')
    )
    op.create_index(op.f('ix_scan_session_axial_params_id'), 'scan_session_axial_params', ['id'], unique=False)
    op.create_table('scan_session_fourd_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_config_id', sa.Integer(), nullable=True),
    sa.Column('breathing_mode', sa.String(length=30), nullable=False),
    sa.Column('phase_count', sa.Integer(), nullable=False),
    sa.Column('acquisition_time', sa.Float(), nullable=False),
    sa.Column('trigger_threshold', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_config_id'], ['fourd_configs.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scan_session_fourd_configs_id'), 'scan_session_fourd_configs', ['id'], unique=False)
    op.create_index(op.f('ix_scan_session_fourd_configs_scan_session_series_id'), 'scan_session_fourd_configs', ['scan_session_series_id'], unique=True)
    op.create_table('scan_session_gating_configs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_config_id', sa.Integer(), nullable=True),
    sa.Column('breathing_mode', sa.String(length=30), nullable=False),
    sa.Column('target_phase', sa.String(length=20), nullable=True),
    sa.Column('threshold_normalized', sa.Float(), nullable=True),
    sa.Column('trigger_direction', sa.String(length=10), nullable=True),
    sa.Column('wait_timeout_s', sa.Float(), nullable=True),
    sa.Column('trigger_delay_ms', sa.Integer(), nullable=False),
    sa.Column('stability_cv_threshold', sa.Float(), nullable=False),
    sa.Column('baseline_drift_mm_threshold', sa.Float(), nullable=False),
    sa.Column('breath_hold_timeout_s', sa.Float(), nullable=True),
    sa.Column('breath_hold_amplitude_tolerance_mm', sa.Float(), nullable=True),
    sa.Column('phase_start_pct', sa.Float(), server_default='0', nullable=True),
    sa.Column('phase_end_pct', sa.Float(), server_default='0', nullable=True),
    sa.Column('max_triggers_per_cycle', sa.Integer(), server_default='1', nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_config_id'], ['gating_configs.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scan_session_gating_configs_id'), 'scan_session_gating_configs', ['id'], unique=False)
    op.create_index(op.f('ix_scan_session_gating_configs_scan_session_series_id'), 'scan_session_gating_configs', ['scan_session_series_id'], unique=True)
    op.create_table('scan_session_helical_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_param_id', sa.Integer(), nullable=True),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('pitch', sa.Float(), nullable=False),
    sa.Column('rotation_time', sa.Float(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.Column('auto_ma', sa.Boolean(), nullable=False),
    sa.Column('ma_min', sa.Float(), nullable=True),
    sa.Column('ma_max', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_param_id'], ['helical_params.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scan_session_series_id')
    )
    op.create_index(op.f('ix_scan_session_helical_params_id'), 'scan_session_helical_params', ['id'], unique=False)
    op.create_table('scan_session_recon_series',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_recon_series_id', sa.Integer(), nullable=True),
    sa.Column('recon_name', sa.String(length=100), nullable=False),
    sa.Column('recon_type', sa.String(length=20), nullable=False),
    sa.Column('kernel', sa.String(length=50), nullable=False),
    sa.Column('matrix', sa.Integer(), nullable=False),
    sa.Column('window_width', sa.Integer(), nullable=False),
    sa.Column('window_level', sa.Integer(), nullable=False),
    sa.Column('slice_thickness', sa.Float(), nullable=False),
    sa.Column('increment', sa.Float(), nullable=True),
    sa.Column('recon_fov', sa.Float(), nullable=True),
    sa.Column('center_x', sa.Float(), nullable=True),
    sa.Column('center_y', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_recon_series_id'], ['recon_series.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scan_session_recon_series_id'), 'scan_session_recon_series', ['id'], unique=False)
    op.create_index(op.f('ix_scan_session_recon_series_scan_session_series_id'), 'scan_session_recon_series', ['scan_session_series_id'], unique=False)
    op.create_table('scan_session_topogram_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_series_id', sa.Integer(), nullable=False),
    sa.Column('template_param_id', sa.Integer(), nullable=True),
    sa.Column('kv', sa.Integer(), nullable=False),
    sa.Column('ma', sa.Integer(), nullable=False),
    sa.Column('scan_length', sa.Float(), nullable=False),
    sa.Column('tube_angle', sa.Float(), nullable=False),
    sa.Column('fov', sa.Float(), nullable=False),
    sa.Column('collimator', sa.String(length=50), nullable=True),
    sa.Column('scan_direction', sa.String(length=10), nullable=True),
    sa.Column('dom', sa.String(length=20), nullable=True),
    sa.Column('ctdi_vol', sa.Float(), nullable=True),
    sa.Column('dlp', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['scan_session_series_id'], ['scan_session_series.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_param_id'], ['topogram_params.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scan_session_series_id')
    )
    op.create_index(op.f('ix_scan_session_topogram_params_id'), 'scan_session_topogram_params', ['id'], unique=False)
    op.create_table('scan_session_breathing_training_params',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('scan_session_fourd_config_id', sa.Integer(), nullable=False),
    sa.Column('template_param_id', sa.Integer(), nullable=True),
    sa.Column('training_duration', sa.Float(), nullable=False),
    sa.Column('target_amplitude', sa.Float(), nullable=False),
    sa.Column('tolerance_range', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['scan_session_fourd_config_id'], ['scan_session_fourd_configs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_param_id'], ['breathing_training_params.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scan_session_fourd_config_id')
    )
    op.create_index(op.f('ix_scan_session_breathing_training_params_id'), 'scan_session_breathing_training_params', ['id'], unique=False)
    # Alembic 初始结构创建结束。


def downgrade() -> None:
    """移除 WT32 初始数据库结构。"""
    op.drop_index(op.f('ix_scan_session_breathing_training_params_id'), table_name='scan_session_breathing_training_params')
    op.drop_table('scan_session_breathing_training_params')
    op.drop_index(op.f('ix_scan_session_topogram_params_id'), table_name='scan_session_topogram_params')
    op.drop_table('scan_session_topogram_params')
    op.drop_index(op.f('ix_scan_session_recon_series_scan_session_series_id'), table_name='scan_session_recon_series')
    op.drop_index(op.f('ix_scan_session_recon_series_id'), table_name='scan_session_recon_series')
    op.drop_table('scan_session_recon_series')
    op.drop_index(op.f('ix_scan_session_helical_params_id'), table_name='scan_session_helical_params')
    op.drop_table('scan_session_helical_params')
    op.drop_index(op.f('ix_scan_session_gating_configs_scan_session_series_id'), table_name='scan_session_gating_configs')
    op.drop_index(op.f('ix_scan_session_gating_configs_id'), table_name='scan_session_gating_configs')
    op.drop_table('scan_session_gating_configs')
    op.drop_index(op.f('ix_scan_session_fourd_configs_scan_session_series_id'), table_name='scan_session_fourd_configs')
    op.drop_index(op.f('ix_scan_session_fourd_configs_id'), table_name='scan_session_fourd_configs')
    op.drop_table('scan_session_fourd_configs')
    op.drop_index(op.f('ix_scan_session_axial_params_id'), table_name='scan_session_axial_params')
    op.drop_table('scan_session_axial_params')
    op.drop_index(op.f('ix_dose_logs_series_type'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_scanned_at'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_scan_session_series_id'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_scan_session_id'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_patient_id_snapshot'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_patient_id'), table_name='dose_logs')
    op.drop_index(op.f('ix_dose_logs_id'), table_name='dose_logs')
    op.drop_table('dose_logs')
    op.drop_index(op.f('ix_breathing_training_params_id'), table_name='breathing_training_params')
    op.drop_table('breathing_training_params')
    op.drop_index(op.f('ix_topogram_params_id'), table_name='topogram_params')
    op.drop_table('topogram_params')
    op.drop_index(op.f('ix_system_logs_timestamp'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_source'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_scan_session_id'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_level'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_id'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_event'), table_name='system_logs')
    op.drop_table('system_logs')
    op.drop_index(op.f('ix_scan_session_series_template_series_id'), table_name='scan_session_series')
    op.drop_index(op.f('ix_scan_session_series_scan_session_id'), table_name='scan_session_series')
    op.drop_index(op.f('ix_scan_session_series_id'), table_name='scan_session_series')
    op.drop_table('scan_session_series')
    op.drop_index(op.f('ix_scan_session_contrast_configs_scan_session_id'), table_name='scan_session_contrast_configs')
    op.drop_index(op.f('ix_scan_session_contrast_configs_id'), table_name='scan_session_contrast_configs')
    op.drop_table('scan_session_contrast_configs')
    op.drop_index(op.f('ix_recon_series_series_id'), table_name='recon_series')
    op.drop_index(op.f('ix_recon_series_id'), table_name='recon_series')
    op.drop_table('recon_series')
    op.drop_index(op.f('ix_helical_params_id'), table_name='helical_params')
    op.drop_table('helical_params')
    op.drop_index(op.f('ix_gating_configs_series_id'), table_name='gating_configs')
    op.drop_index(op.f('ix_gating_configs_id'), table_name='gating_configs')
    op.drop_table('gating_configs')
    op.drop_index(op.f('ix_fourd_configs_series_id'), table_name='fourd_configs')
    op.drop_index(op.f('ix_fourd_configs_id'), table_name='fourd_configs')
    op.drop_table('fourd_configs')
    op.drop_index(op.f('ix_axial_params_id'), table_name='axial_params')
    op.drop_table('axial_params')
    op.drop_index(op.f('ix_user_accounts_username'), table_name='user_accounts')
    op.drop_index(op.f('ix_user_accounts_status'), table_name='user_accounts')
    op.drop_index(op.f('ix_user_accounts_role_code'), table_name='user_accounts')
    op.drop_index(op.f('ix_user_accounts_id'), table_name='user_accounts')
    op.drop_index(op.f('ix_user_accounts_employee_id'), table_name='user_accounts')
    op.drop_table('user_accounts')
    op.drop_index(op.f('ix_series_protocol_id'), table_name='series')
    op.drop_index(op.f('ix_series_id'), table_name='series')
    op.drop_table('series')
    op.drop_index(op.f('ix_scan_sessions_status'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_scan_mode'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_protocol_id'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_patient_id'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_name'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_id'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_age_group'), table_name='scan_sessions')
    op.drop_index(op.f('ix_scan_sessions_acquisition_type'), table_name='scan_sessions')
    op.drop_table('scan_sessions')
    op.drop_index(op.f('ix_contrast_configs_protocol_id'), table_name='contrast_configs')
    op.drop_index(op.f('ix_contrast_configs_id'), table_name='contrast_configs')
    op.drop_table('contrast_configs')
    op.drop_index(op.f('ix_user_roles_code'), table_name='user_roles')
    op.drop_table('user_roles')
    op.drop_index(op.f('ix_protocols_scan_mode'), table_name='protocols')
    op.drop_index(op.f('ix_protocols_name'), table_name='protocols')
    op.drop_index(op.f('ix_protocols_id'), table_name='protocols')
    op.drop_index(op.f('ix_protocols_age_group'), table_name='protocols')
    op.drop_index(op.f('ix_protocols_acquisition_type'), table_name='protocols')
    op.drop_table('protocols')
    op.drop_index(op.f('ix_patients_patient_id'), table_name='patients')
    op.drop_index(op.f('ix_patients_id'), table_name='patients')
    op.drop_table('patients')
    op.drop_index(op.f('ix_drl_entries_id'), table_name='drl_entries')
    op.drop_index(op.f('ix_drl_entries_body_part'), table_name='drl_entries')
    op.drop_index(op.f('ix_drl_entries_age_group'), table_name='drl_entries')
    op.drop_table('drl_entries')
    op.drop_table('dose_settings')
    op.drop_index(op.f('ix_corner_configs_id'), table_name='corner_configs')
    op.drop_table('corner_configs')
    # Alembic 初始结构回退结束。
