#include <stdint.h>

// Global result matrix (regular global)
int C[2][2];

// Global variables to hold the product entries as requested
int i, j, k, l;

void Start(void);

int main(void) {
    Start();               // do not modify or delete this line.
    return 0;
}

// Compute product of two 2x2 matrices, store in global C and assign to globals i,j,k,l
void Start(void) {
    int a = 20, b = 11, c = 5, d = 8;
    int e = 4, f = 2, g = 7, h = 6;

    int A[2][2] = {{20, 11}, {5, 8}};
    int B[2][2] = {{4, 2}, {7, 6}};

    // Use different loop variable names to avoid colliding with globals i,j,k,l
    for (int r = 0; r < 2; ++r) {
        for (int s = 0; s < 2; ++s) {
            C[r][s] = 0;
            for (int t = 0; t < 2; ++t) {
                C[r][s] += A[r][t] * B[t][s];
            }
        }
    }

    // Assign product entries into the requested variables:
    // i = C[0][0], j = C[0][1], k = C[1][0], l = C[1][1]
    i = C[0][0];
    j = C[0][1];
    k = C[1][0];
    l = C[1][1];

    // Expected values (for reference): i=157, j=106, k=76, l=58
}
