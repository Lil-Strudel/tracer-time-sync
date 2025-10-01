import type { Component } from "solid-js";
import GridView from "./pages/grid-view";
import { Route, Router } from "@solidjs/router";

const App: Component = () => {
  return (
    <Router>
      <Route path="/" component={GridView} />
    </Router>
  );
};

export default App;
