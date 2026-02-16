public class Discussion1 {
    public static void main(String[] args) {
        // Shared discount rate (20%)
        double discountRate = 0.20;

        // Item 1: $10
        double price1 = 10.00;
        double finalPrice1 = price1 - (price1 * discountRate);
        System.out.println("Original Price: $10.00 | Discounted Price: $" + finalPrice1);

        // Item 2: $20
        double price2 = 20.00;
        double finalPrice2 = price2 - (price2 * discountRate);
        System.out.println("Original Price: $20.00 | Discounted Price: $" + finalPrice2);

        // Item 3: $30
        double price3 = 30.00;
        double finalPrice3 = price3 - (price3 * discountRate);
        System.out.println("Original Price: $30.00 | Discounted Price: $" + finalPrice3);
    }
}