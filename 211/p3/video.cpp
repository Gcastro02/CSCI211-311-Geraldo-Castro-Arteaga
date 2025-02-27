// video.cpp
// Geraldo Castro
// gcasctroarteaga
// The implementation file for the Video class. This class represents a video object with a title, url, comment, length, and rating. It has a method to print the video information.

#include "video.h"
#include <iostream>

Video::Video(std::string t, std::string u, std::string c, double l, int r)
    : title(t), url(u), comment(c), length(l), rating(r) {}

void Video::print() {
    std::cout << title << ", " << url << ", " << comment << ", " << length << ", ";
        for (int i = 0; i < rating; ++i) {
            std::cout << "*";
        }
        std::cout << "\n";
    }

std::string Video::getTitle() const {
    return title;
}

double Video::getLength() const {
    return length;
}

int Video::getRating() const {
    return rating;
}