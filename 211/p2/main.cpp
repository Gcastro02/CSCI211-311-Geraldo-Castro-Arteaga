#include <iostream>
#include <string>
#include <algorithm>
#include "video.h"

using namespace std;

bool compareByRating(Video* a, Video* b) {
    return a->getRating() > b->getRating();
}

bool compareByLength(Video* a, Video* b) {
    return a->getLength() < b->getLength();
}

bool compareByTitle(Video* a, Video* b) {
    return a->getTitle() < b->getTitle();
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

    if (sortMethod == "rating") {
        stable_sort(videos, videos + count, compareByRating);
    } else if (sortMethod == "length") {
        stable_sort(videos, videos + count, compareByLength);
    } else if (sortMethod == "title") {
        stable_sort(videos, videos + count, compareByTitle);
    }

    for (int i = 0; i < count; ++i) {
        videos[i]->print();
        delete videos[i];
    }

    return 0;
}