# Changelog

All notable changes to the Coding Rule Checker extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-01-XX

### Added
- テンプレート変数: レビュー統計情報をサポート
  - `{reviewIterations}` - チャプターのレビュー回数
  - `{ngCount}` - チャプターで検出されたNG数
  - `{ngRate}` - NG率（ngCount / reviewIterations）
  - `{detectionCount}` - 問題が検出された回数
  - `{detectionRate}` - 検出率（%）

### Changed
- テンプレート表示形式を改善: 検出回数の後に括弧内で検出率（%）を表示
- テーブル形式から検出率の独立カラムを削除し、検出回数カラムに統合

### Fixed
- テンプレート変数が置換されずにそのまま出力される問題を修正
- 変数置換ロジックを改善（チャプターレベル、ルールレベル、テーブルフォーマット）

### Removed
- 拡張機能アクティブ化時の自動出力パネル表示を廃止

## [0.1.0] - 2025-01-XX

### Added
- 初期リリース
- カスタムルールによるコードレビュー機能
- GitHub Copilot Chat統合
- 複数ルールセット対応
- 高速並列処理
- 偽陽性フィルタリング
- 柔軟な出力形式（通常形式・表形式）
- Git差分レビュー機能
- GitHub連携機能
