package com.example.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * 商品リポジトリクラス（正しいコード例）
 *
 * このクラスはコーディング規約に完全準拠しています。
 */
public class ProductRepository {

    private static final Logger LOGGER = Logger.getLogger(ProductRepository.class.getName());
    private static final int MAX_SEARCH_RESULTS = 100;
    private static final int DEFAULT_PAGE_SIZE = 20;

    private final List<String> productCache;
    private boolean isInitialized;

    /**
     * コンストラクタ
     */
    public ProductRepository() {
        this.productCache = new ArrayList<>();
        this.isInitialized = false;
    }

    /**
     * 商品を検索します。
     *
     * @param keyword 検索キーワード
     * @param limit 検索結果の上限
     * @return 検索結果のリスト（見つからない場合は空リスト）
     */
    public List<String> searchProducts(String keyword, int limit) {
        if (keyword == null || keyword.isEmpty()) {
            LOGGER.warning("キーワードが空です");
            return new ArrayList<>();
        }

        if (limit > MAX_SEARCH_RESULTS) {
            limit = MAX_SEARCH_RESULTS;
        }

        List<String> results = new ArrayList<>();
        for (int i = 0; i < productCache.size() && results.size() < limit; i++) {
            String product = productCache.get(i);
            if (product.contains(keyword)) {
                results.add(product);
            }
        }

        return results;
    }

    /**
     * 商品IDで商品を取得します。
     *
     * @param productId 商品ID
     * @return 商品情報（存在しない場合はOptional.empty()）
     */
    public Optional<String> findById(String productId) {
        if (productId == null) {
            return Optional.empty();
        }

        return productCache.stream()
            .filter(product -> product.startsWith(productId))
            .findFirst();
    }

    /**
     * 商品を追加します。
     *
     * @param productName 商品名
     * @throws IllegalArgumentException 商品名が無効な場合
     */
    public void addProduct(String productName) {
        if (productName == null || productName.trim().isEmpty()) {
            throw new IllegalArgumentException("商品名は必須です");
        }

        if (!isInitialized) {
            initialize();
        }

        productCache.add(productName);
        LOGGER.info("商品を追加しました: " + productName);
    }

    /**
     * すべての商品を取得します。
     *
     * @return 商品リスト（空の場合は空リスト）
     */
    public List<String> getAllProducts() {
        return new ArrayList<>(productCache);
    }

    /**
     * 商品が存在するか確認します。
     *
     * @param productId 商品ID
     * @return 存在する場合true
     */
    public boolean hasProduct(String productId) {
        return productId != null && productCache.contains(productId);
    }

    /**
     * キャッシュが初期化済みか確認します。
     *
     * @return 初期化済みの場合true
     */
    public boolean isInitialized() {
        return isInitialized;
    }

    private void initialize() {
        productCache.clear();
        isInitialized = true;
        LOGGER.info("リポジトリを初期化しました");
    }

    private void validateProductData(String data) throws ValidationException {
        if (data == null || data.length() < DEFAULT_PAGE_SIZE) {
            throw new ValidationException("データが不正です");
        }
    }

    /**
     * カスタム検証例外
     */
    private static class ValidationException extends Exception {
        public ValidationException(String message) {
            super(message);
        }
    }
}
