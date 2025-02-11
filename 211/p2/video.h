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
};

#endif