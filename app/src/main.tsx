import { render } from 'preact';
import { App } from './ui/App';
import { garantirDadosIniciais, pedirArmazenamentoPersistente } from './dados/repositorio';
import './estilos/global.css';
import './estilos/formularios.css';
import './estilos/tarefas.css';
import './estilos/calendario.css';
import './estilos/equipe.css';

garantirDadosIniciais();
pedirArmazenamentoPersistente();

render(<App />, document.getElementById('app')!);
