"""Initialisation des tables : media_assets, video_projects, project_assets, app_settings.

Revision ID: 0001
Revises:
Create Date: 2026-08-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("source_url", sa.String(1024), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("thumbnail_path", sa.String(1024), nullable=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("niche", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("duration", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_media_assets_status", "media_assets", ["status"])

    op.create_table(
        "video_projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("banner_text", sa.String(512), nullable=False, server_default=""),
        sa.Column("niche", sa.String(64), nullable=True),
        sa.Column("script_raw", sa.Text(), nullable=False, server_default=""),
        sa.Column("script_ssml", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("voice_id", sa.String(128), nullable=False, server_default="fr-FR-HenriNeural"),
        sa.Column("subtitle_preset", sa.String(32), nullable=False, server_default="classic"),
        sa.Column("audio_path", sa.String(1024), nullable=True),
        sa.Column("timestamps_json", sa.Text(), nullable=True),
        sa.Column("output_path", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_video_projects_status", "video_projects", ["status"])

    op.create_table(
        "project_assets",
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("video_projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "asset_id",
            sa.Integer(),
            sa.ForeignKey("media_assets.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_hook", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("project_assets")
    op.drop_table("video_projects")
    op.drop_table("media_assets")
