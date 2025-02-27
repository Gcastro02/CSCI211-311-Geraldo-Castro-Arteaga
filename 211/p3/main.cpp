// main.cpp
// Geraldo Castro
// gcasctroarteaga
// Main file for the Video List Manager program. This program allows the user to manage a list of videos by inserting, printing, looking up, and removing videos.


#include <iostream>
#include <string>
#include "vlist.h"

using namespace std;

int main() {
    Vlist videoList;
    string command;

    while (getline(cin, command)) {

        if (command == "insert") {
            string title, url, comment;
            double length;
            int rating;

            if (!getline(cin, title)) break;
            if (!getline(cin, url)) break;
            if (!getline(cin, comment)) break;
            if (!(cin >> length)) break;
            if (!(cin >> rating)) break;
            cin.ignore(); // Ignore the newline after the rating

            Video* newVideo = new Video(title, url, comment, length, rating);
            if (!videoList.insert(newVideo)) {
                cerr << "Could not insert video <" << title << ">, already in list." << endl;
                delete newVideo;
            }

        } else if (command == "print") {
            videoList.print();

        } else if (command == "length") {
            cout << videoList.length() << endl;

        } else if (command == "lookup") {
            string title;
            getline(cin, title);
            Video* foundVideo = videoList.lookup(title);
            if (foundVideo) {
                foundVideo->print();
            } else {
                cerr << "Title <" << title << "> not in list." << endl;
            }

        } else if (command == "remove") {
            string title;
            getline(cin, title);
            if (!videoList.remove(title)) {
                cerr << "Title <" << title << "> not in list, could not delete." << endl;
            }

        } else {
            cerr << "<" << command << "> is not a legal command, giving up." << endl;
            return 1;
        }
    }

    return 0;
}