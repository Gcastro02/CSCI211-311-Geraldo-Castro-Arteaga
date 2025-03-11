#include <iostream>
#include <limits>

int main() {
    int number;
    std::cin.exceptions(std::iostream::failbit);

    do {
        std::cout << "Pick a number between 1 and 10." << std::endl;
        try {
            std::cin >> number;
            try {
                if (std::cin.peek() != '\n') {
                    throw number;
                }
                if (number < 1 || number > 10) {
                    std::cout << "You entered an illegal value of " << number << ". Please try again." << std::endl;
                }
            } catch (int pnum) {
                std::cout << "Non-integer value. You entered something after " << pnum << "." << std::endl;
                std::cin.clear(); // reset error flags
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // clear buffer
                number = 0; // reset number to its initial value
            }
        } catch (std::iostream::failure& iof) {
            std::cout << "This is not an integer. Please enter a number." << std::endl;
            std::cin.clear(); // reset error flags
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // clear buffer
        }
    } while (number < 1 || number > 10);

    std::cout << "You picked " << number << "." << std::endl;
    return 0;
}