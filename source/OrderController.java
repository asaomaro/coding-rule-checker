package com.example.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.Optional;

/**
 * 注文コントローラークラス（違反パターン集2）
 */
public class OrderController {

    // 違反: Optionalをフィールドで使用（禁止）
    private Optional<String> orderName;

    // 違反: 未使用変数
    private int unusedVariable;

    // 違反: クラス内の並び順違反（publicメソッドがコンストラクタより前）
    public void processOrder(String orderId) {
        // 違反: キーワードと括弧の間にスペースがない
        if(orderId == null) {
            return;
        }

        // 違反: すべてRuntimeExceptionに包む
        try {
            validateOrder(orderId);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // コンストラクタが後に来ている（違反）
    public OrderController() {
        this.orderName = Optional.empty();
    }

    // 違反: コレクションでnullを返す（空リストを返すべき）
    public List<String> getOrders() {
        return null;
    }

    // 違反: nullチェックなしで引数を使用
    public void updateOrder(String orderId, String status) {
        // nullチェックなしで使用
        int length = orderId.length();

        // 違反: K&Rスタイル違反（行末ではなく次の行に開き括弧）
        if (length > 0)
        {
            processUpdate(orderId, status);
        }
    }

    // 違反: 演算子前後にスペースがない
    private void processUpdate(String id,String status) {
        int result=id.length()+status.length();
        System.out.println(result);
    }

    private void validateOrder(String orderId) throws Exception {
        if (orderId.isEmpty()) {
            throw new Exception("Invalid order");
        }
    }

    // 違反: boolean命名規則違反（名詞単体）
    private boolean valid;

    // 違反: privateメソッドがpublicメソッドより前
    private void helperMethod() {
        // 違反: 二重スペース
        String  message = "helper";
    }

    public void mainMethod() {
        helperMethod();
    }
}
