# Coding Rule Checker

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を行うVSCode拡張機能です。

## 機能

- Markdownで記述されたカスタムコーディングルールに対してコードをレビュー
- GitHub Copilot Chatとシームレスに連携
- ローカルファイルとGitHubリポジトリの両方をサポート
- ファイル全体または差分のみをレビュー
- 高速なレビューのための並列処理
- ノイズを減らすための偽陽性検出
- カスタマイズ可能なレビューテンプレートとプロンプト
- レビュー結果をファイルに保存

## インストール

### VSIXファイルから

1. `.vsix`ファイルをダウンロードまたはビルドします
2. VSCodeを開きます
3. 拡張機能ビューに移動します (`Ctrl+Shift+X`)
4. "..."メニューをクリックし、"VSIXからのインストール..."を選択します
5. ダウンロードした`.vsix`ファイルを選択します

### ソースからビルド

1. リポジトリをクローンします
2. extensionフォルダで`npm install`を実行します
3. `npm run compile`を実行してビルドします
4. `F5`キーを押して拡張機能開発ホストを起動します

### 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- Node.js 20+ (ソースからビルドする場合)

## 設定

### 1. 設定ディレクトリの作成

ワークスペースに `.vscode/coding-rule-checker` ディレクトリを作成します。

### 2. settings.jsonの作成

```json
{
  "model": "copilot-gpt-4",  // オプション: 省略時は現在選択されているCopilotモデルを使用
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
  "rulesets": {
    ".js": ["sample-rule"],
    ".ts": ["sample-rule"]
  }
}
```

**注:** `model` フィールドはオプションです。指定しない場合、拡張機能はCopilot Chatで現在選択されているモデルを使用します。

#### 設定項目

| 項目 | 必須 | 説明 |
|------|------|------|
| `model` | × | 使用するLLMモデル（省略時はCopilot Chatで選択中のモデルを使用） |
| `systemPromptPath` | ○ | システムプロンプトファイルのパス |
| `templatesPath` | ○ | レビュー結果テンプレートファイルのパス |
| `fileOutput.enabled` | ○ | レビュー結果のファイル出力を有効にするか |
| `fileOutput.outputDir` | ○ | 出力先ディレクトリ |
| `fileOutput.outputFileName` | ○ | 出力ファイル名（`{originalFileName}`でファイル名を挿入可能） |
| `rulesets` | ○ | ファイルパターンとルールセットのマッピング |

### 3. プロンプトテンプレートの作成

- `system-prompt.md`: AIレビュアーのためのシステムプロンプト
- `review-prompt.md`: レビューリクエストのテンプレート
- `false-positive-prompt.md`: 偽陽性チェックのテンプレート
- `review-results-template.md`: レビュー結果の出力テンプレート

### 4. ルール設定の作成

各ルールセットに対して `rule-settings.json` を作成します:

```json
{
  "rulesPath": ".vscode/coding-rule-checker/sample-rule/rules",
  "templatesPath": ".vscode/coding-rule-checker/sample-rule/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "aggregationThreshold": 0.5
}
```

#### 設定項目

| 項目 | 必須 | 説明 |
|------|------|------|
| `rulesPath` | ○ | ルールファイルが格納されているディレクトリ |
| `reviewPromptPath` | × | レビュープロンプトテンプレート（省略時はデフォルトを使用） |
| `falsePositivePromptPath` | × | 誤検知チェックプロンプトテンプレート（省略時はデフォルトを使用） |
| `commonInstructionsPath` | × | 全章共通の指示を記載したMarkdownファイル |
| `templatesPath` | ○ | レビュー結果テンプレートファイルのパス |
| `fileOutput.enabled` | ○ | レビュー結果のファイル出力を有効にするか |
| `fileOutput.outputDir` | ○ | 出力先ディレクトリ |
| `fileOutput.outputFileName` | ○ | 出力ファイル名（`{originalFileName}`でファイル名を挿入可能） |
| `reviewIterations.default` | ○ | デフォルトのレビュー試行回数 |
| `reviewIterations.chapter` | × | 章ごとの試行回数（章番号をキーとして指定） |
| `falsePositiveCheckIterations.default` | ○ | デフォルトの誤検知チェック試行回数 |
| `falsePositiveCheckIterations.chapter` | × | 章ごとの誤検知チェック試行回数 |
| `aggregationThreshold` | × | 多数決のしきい値（0.0-1.0、デフォルト: 0.5）<br>1.0=1回でも検出で採用、0.5=過半数、0.0=全試行で検出 |
| `chapterFilters.default` | × | デフォルトでレビューする章のリスト |
| `chapterFilters.patterns` | × | ファイルパターンごとのレビュー対象章 |

### 5. コーディングルールの記述

ルールディレクトリにMarkdownファイルを作成します:

```markdown
## 1. コード品質ルール

### 1.1 命名規則

変数名と関数名は、説明的でcamelCaseに従う必要があります。

### 1.2 関数の複雑さ

関数は小さく、単一の責務に集中する必要があります。
```

## 使い方

### /review コマンド（ファイル全体をレビュー）

```bash
# ローカルファイルをレビュー
@coding-rule-checker /review #file

# フォルダ内の全ファイルをレビュー（再帰的）
@coding-rule-checker /review #folder

# GitHubのファイルをレビュー
@coding-rule-checker /review https://github.com/owner/repo/blob/main/src/index.ts
```

### /diff コマンド（差分のみをレビュー）

```bash
# 未コミットの変更をレビュー（全ファイル）
@coding-rule-checker /diff

# 未コミットの変更をレビュー（特定ファイル）
@coding-rule-checker /diff #file

# ブランチ間の差分をレビュー
@coding-rule-checker /diff main..feature #file

# コミットハッシュ間の差分をレビュー
@coding-rule-checker /diff abc123..def456 #file

# タグ間の差分をレビュー
@coding-rule-checker /diff v1.0.0..v2.0.0 #file

# GitHubコミットの差分をレビュー
@coding-rule-checker /diff https://github.com/owner/repo/commit/abc123def456

# GitHub Compare（ブランチ比較）
@coding-rule-checker /diff https://github.com/owner/repo/compare/main...feature

# プルリクエストの差分をレビュー（gh CLIを使用）
gh pr diff 123 | @coding-rule-checker /diff
```

## 仕組み

1. **コード取得**: ローカルファイルまたはGitHubからコードを取得します
2. **ルール読み込み**: ファイル拡張子に基づいて適用可能なルールを読み込みます
3. **並列レビュー**: 各章を複数のイテレーションで並列にレビューします
4. **偽陽性チェック**: 偽陽性を減らすために検出結果を検証します
5. **集約**: 複数のイテレーションからの結果を統合します
6. **出力**: 結果をチャットに表示し、オプションでファイルに保存します

## 高度な機能

### 複数回のレビューイテレーション

精度を向上させるために、各章を複数回レビューできます。結果は投票メカニズムを使用して集約されます。

### 偽陽性検出

疑わしい検出結果は、偽陽性を除外するために複数回チェックされます。

### カスタムテンプレート

プレースホルダーを使用して、Markdownテンプレートでレビュー出力形式をカスタマイズします。

### GitHub連携

`gh` CLIを使用してGitHubリポジトリからコードを取得し、以下をサポートします:
- 特定のファイル
- プルリクエスト
- コミット範囲
- ブランチ比較

## 要件

- VSCode 1.85.0 以上
- GitHub Copilot サブスクリプション
- `gh` CLI (GitHub連携用)

## 拡張機能の設定

この拡張機能は、以下の設定を提供します:

- `.vscode/coding-rule-checker/` 内の設定ファイル
- Markdown形式のカスタムルール定義
- AIとの対話のためのプロンプトテンプレート

## 既知の問題

- 大きなファイルのレビューには時間がかかる場合があります
- GitHub APIのレート制限が適用される場合があります

## リリースノート

### 0.1.0

コア機能を備えた初回リリース:
- Markdownルールに基づくコードレビュー
- Copilot Chat連携
- ローカルおよびGitHubサポート
- 並列処理
- 偽陽性検出

## 貢献

貢献を歓迎します！プルリクエストを気軽にサブミットしてください。

## ライセンス

MIT
