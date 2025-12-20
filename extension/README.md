# コーディングルールチェッカー

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を実行するVSCode拡張機能です。

## 機能

- Markdownで記述されたカスタムコーディングルールに対してコードをレビュー
- GitHub Copilot Chatとシームレスに連携
- ローカルファイルとGitHubリポジトリの両方をサポート
- ファイル全体または差分（diff）のみをレビュー
- 並列処理による高速なレビュー
- 偽陽性検出によるノイズ削減
- カスタマイズ可能なレビューテンプレートとプロンプト
- レビュー結果をファイルに保存

## インストール

### VSIXファイルから

1. `.vsix`ファイルをダウンロードまたはビルドします
2. VSCodeを開きます
3. 拡張機能ビューに移動します (`Ctrl+Shift+X`)
4. 「...」メニューをクリックし、「VSIXからのインストール...」を選択します
5. ダウンロードした`.vsix`ファイルを選択します

### ソースからビルド

1. リポジトリをクローンします
2. extensionフォルダで `npm install` を実行します
3. `npm run compile` を実行してビルドします
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
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "maxConcurrentReviews": 10,
  "showRulesWithNoIssues": false,
  "ruleset": "typescript-rules",
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  },
  "rulesets": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts", "*.spec.ts"],
    "5": ["util/**/*.ts"]
  }
}
```

#### 設定項目の説明

**必須項目:**
- `model`: 使用するLLMモデル（例: "copilot-gpt-4", "gpt-5-mini"）
- `systemPromptPath`: システムプロンプトファイルのパス
- `summaryPromptPath`: サマリープロンプトファイルのパス
- `templatesPath`: レビュー結果テンプレートファイルのパス
- `ruleset`: 使用するルールセット名（例: "typescript-rules", "java-rules"）
- `fileOutput`: ファイル出力設定
  - `enabled`: ファイル出力の有効/無効
  - `outputDir`: 出力ディレクトリ
  - `outputFileName`: 出力ファイル名パターン
- `rulesets`: **章番号とファイルパターンのマッピング**
  - キー: 章番号（例: "1", "2", "3"）
  - 値: ファイルパターンの配列
  - **重要**:
    - 章番号が**設定されていない**章 → **すべてのファイル**でレビュー
    - 章番号が**設定されている**章 → **パターンに一致するファイル**のみでレビュー
  - ファイルパターンはGlob形式をサポート（例: `*.component.ts`, `util/**/*.ts`）

**オプション項目:**
- `maxConcurrentReviews` (デフォルト: 10): 同時実行する最大LLMリクエスト数
  - 推奨値: 5-20（APIプランに応じて調整）
  - 高い値 = 速いレビュー、ただしAPIレート制限のリスク
  - 低い値 = 遅いレビュー、ただし安定
- `showRulesWithNoIssues` (デフォルト: false): 指摘がないルール項番も表示するかどうか

#### rulesets の詳細な設定例

**例1: UIコンポーネントとテストで異なる章をレビュー**
```json
{
  "ruleset": "typescript-rules",
  "rulesets": {
    "1": ["*.component.ts", "*.service.ts"],
    "2": [],
    "3": ["*.test.ts", "*.spec.ts"],
    "4": ["util/**/*.ts", "helper/**/*.ts"]
  }
}
```
- **章1**: `*.component.ts`と`*.service.ts`のみレビュー
- **章2**: 設定なし（空配列） → すべてのファイルでレビュー
- **章3**: テストファイル(`*.test.ts`, `*.spec.ts`)のみレビュー
- **章4**: utilとhelperディレクトリ配下のファイルのみレビュー
- **章5以降**: 設定なし → すべてのファイルでレビュー

**例2: 特定の章だけ特定のファイルに限定**
```json
{
  "ruleset": "java-rules",
  "rulesets": {
    "1": ["*Controller.java", "*Service.java"]
  }
}
```
- **章1**: ControllerとServiceクラスのみレビュー
- **章2以降**: 設定なし → すべてのJavaファイルでレビュー

**Globパターンの例:**
- `*.component.ts` - 任意のディレクトリの `xxx.component.ts` にマッチ
- `src/*.ts` - `src` 直下の `.ts` ファイルにマッチ
- `src/**/*.ts` - `src` 配下の全ての `.ts` ファイルにマッチ（ネスト含む）
- `**/*.test.ts` - 全ディレクトリの `xxx.test.ts` にマッチ

### 3. プロンプトテンプレートの作成

- `system-prompt.md`: AIレビュアー向けのシステムプロンプト
- `review-prompt.md`: レビューリクエスト用のテンプレート
- `false-positive-prompt.md`: 偽陽性チェック用のテンプレート
- `summary-prompt.md`: レビューサマリー用のテンプレート

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
    "default": 2
  }
}
```

**設定項目の説明:**
- `rulesPath` (必須): ルールファイルが格納されているディレクトリのパス
- `templatesPath` (オプション): レビュー結果テンプレートのパス
- `fileOutput`: ファイル出力設定
- `reviewIterations`: レビューの反復回数設定
- `falsePositiveCheckIterations`: 偽陽性チェックの反復回数設定

**Note:** 章のフィルタリングは `settings.json` の `rulesets` で行います

### 5. コーディングルールの記述

ルールディレクトリにMarkdownファイルを作成します:

```markdown
## 1. コード品質ルール

### 1.1 命名規則

変数名と関数名は説明的であり、camelCaseに従う必要があります。

### 1.2 関数の複雑さ

関数は小さく、単一の責務に集中する必要があります。
```

## 使用方法

### 特定のファイルをレビュー

```
@coding-rule-checker /review #file
```

### git diffをレビュー

```
@coding-rule-checker /diff main..feature #file
```

### 変更されたすべてのファイルをレビュー

```
@coding-rule-checker /diff
```

### GitHubリポジトリをレビュー

```
@coding-rule-checker /diff https://github.com/owner/repo main..feature
```

## 動作の仕組み

1. **コード取得**: ローカルファイルまたはGitHubからコードを取得します
2. **ルール読み込み**: ファイル拡張子に基づいて適用可能なルールを読み込みます
3. **並列レビュー**: 各章を複数回の反復処理で並列にレビューします
4. **偽陽性チェック**: 偽陽性を減らすために検出結果を検証します
5. **集約**: 複数回の反復処理の結果を結合します
6. **出力**: 結果をチャットに表示し、オプションでファイルに保存します

## 高度な機能

### 複数回のレビュー反復

精度を向上させるために、各章を複数回レビューすることができます。結果は投票メカニズムを使用して集約されます。

### 偽陽性検出

疑わしい検出結果は、偽陽性を除外するために複数回チェックされます。

### カスタムテンプレート

プレースホルダを使用して、Markdownテンプレートでレビューの出力形式をカスタマイズします。

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
- AIとの対話用のプロンプトテンプレート

## 既知の問題

- 大規模なファイルのレビューには時間がかかる場合があります
- GitHub APIのレート制限が適用される場合があります

## リリースノート

### 0.1.0

初期リリース。主要機能:
- Markdownルールに基づくコードレビュー
- Copilot Chat連携
- ローカルおよびGitHubのサポート
- 並列処理
- 偽陽性検出

## コントリビューション

コントリビューションを歓迎します！プルリクエストを気軽にサブミットしてください。

## ライセンス

MIT