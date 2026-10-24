/** The part of the router that "Back to home" needs. */
export interface HomeNavigator {
  navigate(href: "/"): void;
}

/**
 * Always lands on the home screen, whatever the history. Going back instead depends on how the screen was reached,
 * so a user who came through several screens could end up somewhere other than home.
 */
export function goHome(navigator: HomeNavigator): void {
  navigator.navigate("/");
}
