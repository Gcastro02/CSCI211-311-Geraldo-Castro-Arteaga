import requests
from bs4 import BeautifulSoup

def print_secret_message(url):
    # Fetch the HTML content from the published Google Doc
    try:
        response = requests.get(url)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching the URL: {e}")
        return

    # Parse the HTML content
    soup = BeautifulSoup(response.text, 'html.parser')

    # Google Docs publishes tabular data within <table> tags
    table = soup.find('table')
    if not table:
        print("No table found in the document.")
        return

    # Extract all rows from the table
    rows = table.find_all('tr')
    
    data = []
    
    # Iterate through the rows, skipping the header if present
    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 3:
            try:
                # Extract text and strip whitespace. 
                # Assuming standard column layout: x-coordinate, Character, y-coordinate
                x_str = cols[0].get_text(strip=True)
                char = cols[1].get_text(strip=True)
                y_str = cols[2].get_text(strip=True)

                # Attempt to cast coordinates to integers. 
                # This naturally skips the header row because "x-coordinate" will throw a ValueError.
                x = int(x_str)
                y = int(y_str)
                
                # If the character column was purely whitespace and got stripped, restore it as a space
                if not char:
                    char = ' '

                data.append((x, char, y))
            except ValueError:
                # Skip any rows that don't contain valid integer coordinates
                continue

    if not data:
        print("No valid coordinate data found to process.")
        return

    # Determine the boundaries of the grid
    max_x = max(item[0] for item in data)
    max_y = max(item[2] for item in data)

    # Initialize a 2D grid filled with spaces
    # Dimensions are max_x + 1 and max_y + 1 to account for 0-indexing
    grid = [[' ' for _ in range(max_x + 1)] for _ in range(max_y + 1)]

    # Populate the grid with the characters at their specific coordinates
    for x, char, y in data:
        grid[y][x] = char

    # Print the resulting grid
    # Because (0,0) is typically the bottom-left corner, we must print the 
    # rows in reverse order (from max_y down to 0) so the image is upright.
    for y in range(max_y, -1, -1):
        print("".join(grid[y]))

# Call the function using the provided URL
url = " https://docs.google.com/document/d/e/2PACX-1vSvM5gDlNvt7npYHhp_XfsJvuntUhq184By5xO_pA4b_gCWeXb6dM6ZxwN8rE6S4ghUsCj2VKR21oEP/pub"
print_secret_message(url)