# Taco Truck Locator
Built as a solution for the problem described in *TASK.md*.

## Project Overview
- Single-page web app for browsing taco truck locations/
- Renders a list of locations with key details (name, address, hours, phone).
- Shows an embedded Google Map for the selected location.

## How to run
- Needs to run with local server, since the API requires CORS and just opening the *index.html* in the browser doesn't provide CORS.
- Start any static server from project root.
- Example: `python3 -m http.server 5500`
- Open `http://localhost:5500/index.html`

## Data Sources
- Primary API endpoint for live data.
- Local mock dataset as fallback, this was added mainly for dev purposes since the API has rate limiting.
- Google maps iframe is used to display locations.

## Notes
- Minified *scripts.js* and *styles.css* files are used when running to improve performance. You can generate the minified files by using the following commands:
```
npx terser scripts/scripts.js -c -m -o scripts/scripts.min.js
npx clean-css-cli -o styles/styles.min.css styles/styles.css
```
- Some data such as phone number and distance from truck were included in the design but were not provided in the API. I choose not to display anything in those cases for better UX.
- Icons do not match design perfectly as I choose to use FontAwesome icons to enable better styling and more reactive UI.
- I tried to mimic the design as close as possible, with some improvements. But the png files didn't provide as much details on styles as Figma would.
