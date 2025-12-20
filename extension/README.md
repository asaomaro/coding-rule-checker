# コーディングルールチェッカー

Markdown形式で記述されたコーディングルールに基づき、静的コード解析を実行するVSCode拡張機能です。

## 機能

- **カスタムルールによるレビュー**: Markdownで記述されたコーディングルールに対してコードをレビュー
- **GitHub Copilot Chat連携**: VSCodeのCopilot Chatとシームレスに統合
- **複数ソース対応**: ローカルファイル、Git差分、GitHubリポジトリをサポート
- **複数ルールセット対応**: ファイルパターンに応じて異なるルールセットを適用
- **高速並列処理**: ファイル、ルールセット、章、イテレーションを並列実行
- **重複除外**: 同一ルール・同一行番号の重複指摘を自動除外
- **偽陽性フィルタリング**:
  - 設定可能なしきい値による偽陽性除外
  - 複数回のレビューで一貫して検出される指摘のみを採用
  - 偽陽性チェックによる誤検知の削減
- **柔軟な出力形式**:
  - 通常形式（階層構造）と表形式をサポート
  - カスタマイズ可能なMarkdownテンプレート
- **章別フィルタリング**: ファイルパターンに応じて特定の章のみをレビュー
- **レビュー結果の保存**: 結果をMarkdownファイルとして保存

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

**パターン1: 単一ルールセット（シンプルモード）**
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
  }
}
```

**パターン2: 複数ルールセットとファイルパターンマッチング（アドバンスモード）**
```json
{
  "model": "copilot-gpt-4",
  "systemPromptPath": ".vscode/coding-rule-checker/system-prompt.md",
  "summaryPromptPath": ".vscode/coding-rule-checker/summary-prompt.md",
  "maxConcurrentReviews": 10,
  "showRulesWithNoIssues": false,
  "ruleset": {
    "common": ["*.java", "*.html"],
    "app-rule": ["common/*.java", "component*.java", "*.sql"],
    "web-rule": ["*.html", "*.css"]
  },
  "templatesPath": ".vscode/coding-rule-checker/review-results-template.md",
  "fileOutput": {
    "enabled": true,
    "outputDir": ".vscode/coding-rule-checker/review-results",
    "outputFileName": "reviewed_{originalFileName}.md"
  }
}
```

#### 設定項目の説明

**必須項目:**
- `model`: 使用するLLMモデル（例: "copilot-gpt-4", "gpt-5-mini"）
- `systemPromptPath`: システムプロンプトファイルのパス
- `summaryPromptPath`: サマリープロンプトファイルのパス
- `templatesPath`: レビュー結果テンプレートファイルのパス
- `ruleset`: ルールセット設定
  - **シンプルモード（文字列）**: 単一のルールセット名（例: `"typescript-rules"`）
  - **アドバンスモード（オブジェクト）**: ルールセット名とファイルパターンのマッピング
    - キー: ルールセット名（例: `"common"`, `"app-rule"`）
    - 値: ファイルパターンの配列（Glob形式）
    - 複数のパターンにマッチするファイルは、マッチした全てのルールセットでレビューされます
    - 例: `"common/*.java"` は `common` ディレクトリ配下の全Javaファイルにマッチ
- `fileOutput`: ファイル出力設定
  - `enabled`: ファイル出力の有効/無効
  - `outputDir`: 出力ディレクトリ
  - `outputFileName`: 出力ファイル名パターン

**オプション項目:**
- `maxConcurrentReviews` (デフォルト: 10): 同時実行する最大LLMリクエスト数
  - 推奨値: 5-20（APIプランに応じて調整）
  - 高い値 = 速いレビュー、ただしAPIレート制限のリスク
  - 低い値 = 遅いレビュー、ただし安定
- `showRulesWithNoIssues` (デフォルト: false): 指摘がないルール項番も表示するかどうか
- `outputFormat` (デフォルト: "normal"): レビュー結果の出力形式
  - `"normal"`: 通常の階層形式（章・ルール単位）
  - `"table"`: 表形式（章番号、行番号、コード、理由、修正案、修正例をカラムで表示）
  - テンプレートカスタマイズ: `review-results-template.md` で `TABLE_RULESET_SECTION`, `TABLE_HEADER`, `TABLE_ROW` マーカーを使用して定義
- `issueDetectionThreshold` (デフォルト: 0.5): 複数回のレビューイテレーションでの指摘検出しきい値
  - 範囲: 0.00 ～ 1.00（小数点第2位まで指定可能）
  - `0.0`: すべてのイテレーションで検出された指摘のみ採用（最も厳格）
  - `0.5`: 過半数のイテレーションで検出された指摘を採用（デフォルト）
  - `1.0`: 1回でも検出された指摘を採用（最も寛容）
  - 偽陽性（誤検知）を減らすため、複数回のレビューで一貫して検出される指摘のみを採用する設定

#### ruleset（アドバンスモード）の詳細な設定例

**例1: 共通ルールと特定ファイル向けルールを組み合わせる**
```json
{
  "ruleset": {
    "common": ["*.java", "*.html"],
    "backend-rule": ["src/main/**/*.java", "*.sql"],
    "frontend-rule": ["src/web/**/*.html", "*.css", "*.js"]
  }
}
```
- `common/*.java` ファイルは `common` と `backend-rule` の両方でレビューされます
- `src/web/index.html` ファイルは `common` と `frontend-rule` の両方でレビューされます

**例2: ファイル種類ごとに異なるルールセット**
```json
{
  "ruleset": {
    "java-rule": ["*.java"],
    "sql-rule": ["*.sql"],
    "web-rule": ["*.html", "*.css", "*.js"]
  }
}
```
- 各ファイルタイプは対応するルールセットでのみレビューされます

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
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3
    }
  },
  "falsePositiveCheckIterations": {
    "default": 2
  },
  "chapterFilePatterns": {
    "1": ["*.component.ts", "*.service.ts"],
    "3": ["*.test.ts", "*.spec.ts"]
  }
}
```

**設定項目の説明:**
- `rulesPath` (必須): ルールファイルが格納されているディレクトリのパス
- `templatesPath` (オプション): レビュー結果テンプレートのパス
- `reviewIterations`: レビューの反復回数設定
- `falsePositiveCheckIterations`: 偽陽性チェックの反復回数設定
- `chapterFilePatterns` (オプション): **章番号とファイルパターンのマッピング**
  - キー: 章番号（例: "1", "2", "3"）
  - 値: ファイルパターンの配列
  - **重要**:
    - 章番号が**設定されていない**章 → **すべてのファイル**でレビュー
    - 章番号が**設定されている**章 → **パターンに一致するファイル**のみでレビュー
  - ファイルパターンはGlob形式をサポート（例: `*.component.ts`, `util/**/*.ts`）

#### chapterFilePatterns の詳細な設定例

**例1: UIコンポーネントとテストで異なる章をレビュー**
```json
{
  "chapterFilePatterns": {
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
  "chapterFilePatterns": {
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

### 基本的な使用方法

**特定のファイルをレビュー**
```
@coding-rule-checker /review #file
```

**ファイル名を指定してレビュー**
```
@coding-rule-checker /review #file:UserService.java
```

**複数ファイルを同時にレビュー**
```
@coding-rule-checker /review #file:User.java #file:Order.java #file:Product.java
```

**フォルダ内の全ファイルをレビュー**
```
@coding-rule-checker /review #folder
```

**特定のルールセットを指定してレビュー**
```
@coding-rule-checker /review --ruleset=typescript-rules #file
```

### Git差分のレビュー

**コミット範囲の差分をレビュー**
```
@coding-rule-checker /diff main..feature
```

**特定ファイルの差分のみレビュー**
```
@coding-rule-checker /diff main..feature #file
```

**未コミットの変更をレビュー**
```
@coding-rule-checker /diff
```

### GitHubリポジトリのレビュー

**GitHubのコミット範囲をレビュー**
```
@coding-rule-checker /diff https://github.com/owner/repo main..feature
```

**GitHubの特定ファイルをレビュー**
```
@coding-rule-checker /review https://github.com/owner/repo/blob/main/src/file.ts
```

## 動作の仕組み

1. **コード取得**: ローカルファイル、Git差分、またはGitHub（`gh` CLI経由）からコードを取得
2. **ルールセット選択**: ファイルパターンマッチングに基づいて適用するルールセットを決定
3. **章フィルタリング**: `chapterFilePatterns`設定に基づいて、ファイルごとにレビューする章を選択
4. **並列レビュー実行**:
   - ファイル × ルールセットの組み合わせを並列処理
   - 各章を複数回（`reviewIterations`）並列にレビュー
   - 同時実行数は`maxConcurrentReviews`で制御
5. **重複除外**: 同一ルールID・同一行番号の指摘を自動的に統合
6. **結果集約**:
   - 複数回のイテレーション結果を集約
   - `issueDetectionThreshold`に基づいて偽陽性をフィルタリング
   - しきい値未満の検出頻度の指摘は除外
7. **偽陽性チェック**: 疑わしい検出結果を複数回チェックして誤検知を除外
8. **出力生成**:
   - 通常形式または表形式で結果を整形
   - `showRulesWithNoIssues`設定に応じて指摘なしルールも表示
   - Copilot Chatに表示し、オプションでMarkdownファイルに保存

## 高度な機能

### 複数回のレビュー反復

精度を向上させるために、各章を複数回レビューすることができます。`reviewIterations`設定で章ごとに反復回数をカスタマイズ可能です。

```json
{
  "reviewIterations": {
    "default": 2,
    "chapter": {
      "1": 3,
      "5": 4
    }
  }
}
```

### 偽陽性フィルタリング

**しきい値ベースのフィルタリング**:
- `issueDetectionThreshold`設定により、複数回のレビューで一貫して検出される指摘のみを採用
- 例: しきい値0.5、3回のレビュー → 2回以上検出された指摘のみ採用

**偽陽性チェック**:
- 検出された各指摘に対して複数回の偽陽性チェックを実行
- `falsePositiveCheckIterations`設定でチェック回数をカスタマイズ可能

### 重複除外

同一ルールID・同一行番号の指摘は自動的に1つに統合されます。これにより、複数回のレビューで同じ問題が重複して報告されることを防ぎます。

### 章別フィルタリング

`chapterFilePatterns`を使用して、特定のファイルタイプに対してのみ特定の章をレビューできます:

```json
{
  "chapterFilePatterns": {
    "1": ["*Controller.java", "*Service.java"],
    "3": ["*.test.ts", "*.spec.ts"]
  }
}
```

- 章1: ControllerとServiceクラスのみ
- 章3: テストファイルのみ
- その他の章: すべてのファイル

### カスタムテンプレート

Markdownテンプレートでレビュー出力形式をカスタマイズできます:

**通常形式**: 階層構造で章・ルールごとに整理
**表形式**: Markdownテーブルで一覧表示

テンプレートは`review-results-template.md`で定義し、プレースホルダー（`{fileName}`, `{ruleId}`, `{lineNumber}`など）を使用します。

### GitHub連携

`gh` CLIを使用してGitHubリポジトリからコードを取得:
- 特定のファイル
- プルリクエスト
- コミット範囲（例: `v1.0.0..v2.0.0`）
- ブランチ比較（例: `main..feature`）

### 複数ルールセット対応

ファイルパターンに応じて異なるルールセットを自動的に適用:

```json
{
  "ruleset": {
    "java-rule": ["*.java"],
    "web-rule": ["*.html", "*.css"],
    "sql-rule": ["*.sql"]
  }
}
```

1つのファイルが複数のパターンにマッチする場合、すべてのルールセットでレビューされます。

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

### 最新版

追加機能:
- 表形式出力対応（`outputFormat`設定）
- 章ごとの階層出力
- 設定可能な偽陽性検出しきい値（`issueDetectionThreshold`）
- 重複指摘の自動除外
- 表形式での`showRulesWithNoIssues`対応
- 複数ルールセット対応
- 章別ファイルパターンフィルタリング
- 複数ファイル・フォルダレビュー対応

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