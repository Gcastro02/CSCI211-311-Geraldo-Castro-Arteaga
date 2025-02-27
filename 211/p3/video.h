// video.h
// Geraldo Castro
// gcasctroarteaga
// Header file for the Video class. This class represents a video object with a title, url, comment, length, and rating. It has a method to print the video information.

#ifndef VIDEO_H
#define VIDEO_H

#include <string>

class Video {
    private:
        std::string title;
        std::string url;
        std::string comment;
        double length;
        int rating;

    public:
        Video(std::string t, std::string u, std::string c, double l, int r);
        void print();
        std::string getTitle() const;
        double getLength() const;
        int getRating() const;
};

#endif