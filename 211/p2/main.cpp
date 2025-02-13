#include <iostream>
#include <string>
#include "video.h"

using namespace std;

// Function sorts an array of video pointers using the bubble sort algorithm
void bubbleSort(Video* videos[], int count, const string& sortMethod) {
    for (int i = 0; i < count - 1; ++i) {
        for (int j = 0; j < count - i - 1; ++j) {
            bool shouldSwap = false;
            if (sortMethod == "rating") {
                shouldSwap = videos[j]->getRating() < videos[j + 1]->getRating();
            } else if (sortMethod == "length") {
                shouldSwap = videos[j]->getLength() > videos[j + 1]->getLength();
            } else if (sortMethod == "title") {
                shouldSwap = videos[j]->getTitle() > videos[j + 1]->getTitle();
            }

            if (shouldSwap) {
                Video* temp = videos[j];
                videos[j] = videos[j + 1];
                videos[j + 1] = temp;
            }
        }
    }
}

int main() {
    string sortMethod;
    getline(cin, sortMethod);

    if (sortMethod != "rating" && sortMethod != "length" && sortMethod != "title") {
        cerr << sortMethod << " is not a legal sorting method, giving up." << endl;
        return 1;
    }

    Video* videos[100];
    int count = 0;

    while (count < 100) {
        string title, url, comment;
        double length;
        int rating;

        if (!getline(cin, title)) break;
        if (!getline(cin, url)) break;
        if (!getline(cin, comment)) break;
        if (!(cin >> length)) break;
        if (!(cin >> rating)) break;
        cin.ignore(); // Ignore the newline after the rating

        videos[count] = new Video(title, url, comment, length, rating);
        count++;
    }

    if (count == 100 && cin.peek() != EOF) {
        cerr << "Too many videos, giving up." << endl;
        return 1;
    }

    bubbleSort(videos, count, sortMethod);

    for (int i = 0; i < count; ++i) {
        videos[i]->print();
        delete videos[i];
    }

    return 0;
}