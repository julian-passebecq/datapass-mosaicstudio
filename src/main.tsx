// Separate entry graphs: a client website does not import the analytical workbench.
const params=new URLSearchParams(location.search);
if(params.has('app')||params.has('sites'))void import('./client-main');
else void import('./workbench-main');
export {};
