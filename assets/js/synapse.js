// assets/js/synapse.js
// Interactive Synapse Network Visualization

const d3 = window.d3;

export function initSynapseView() {
  const svg = d3.select("#synapse-svg");
  if (svg.empty()) return;

  svg.selectAll("*").remove(); // clear any existing graph

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  const nodes = d3.range(30).map(i => ({ id: i }));
  const links = d3.range(60).map(() => ({
    source: Math.floor(Math.random() * nodes.length),
    target: Math.floor(Math.random() * nodes.length)
  }));

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).distance(80).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-60))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg.append("g")
    .attr("stroke", "#0ff")
    .attr("stroke-opacity", 0.3)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1);

  const node = svg.append("g")
    .attr("fill", "#fff")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 5)
    .attr("fill", "#00ffff")
    .call(drag(simulation));

  node.append("title").text(d => `Node ${d.id}`);

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);
  });

  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }
}

// Auto-init when the tab is opened
document.addEventListener("DOMContentLoaded", () => {
  const synapseTab = document.querySelector('[data-tab="synapse"]');
  if (synapseTab) {
    synapseTab.addEventListener("click", () => {
      initSynapseView();
    });
  }
});
